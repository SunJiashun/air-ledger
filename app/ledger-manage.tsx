import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { fullSync } from '../src/sync/syncEngine';
import { useTheme } from '../src/theme/ThemeProvider';
import { getDatabase } from '../src/db/database';
import { useAuthStore } from '../src/stores/authStore';
import { useSyncStore } from '../src/stores/syncStore';
import { useBillStore } from '../src/stores/billStore';
import { supabase } from '../src/sync/supabaseClient';
import { uuidv4 } from '../src/utils/uuid';

interface Ledger {
  id: string;
  name: string;
  inviteCode: string | null;
  ownerId: string | null;
  createdAt: string;
  memberCount: number;
}

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export default function LedgerManageScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const userId = useAuthStore((s) => s.userId);
  const userEmail = useAuthStore((s) => s.email);
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const isOnline = useSyncStore((s) => s.isOnline);

  const currentLedgerId = useBillStore((s) => s.currentLedgerId);
  const setLedger = useBillStore((s) => s.setLedger);

  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Members modal state
  const [membersModalVisible, setMembersModalVisible] = useState(false);
  const [viewingLedger, setViewingLedger] = useState<Ledger | null>(null);
  const [members, setMembers] = useState<Array<{ user_id: string; email: string; role: string }>>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // Create modal state
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newLedgerName, setNewLedgerName] = useState('');
  const [createdInviteCode, setCreatedInviteCode] = useState<string | null>(null);

  // Double-tap guard for ledger creation
  const [isCreating, setIsCreating] = useState(false);

  // Join modal state
  const [joinModalVisible, setJoinModalVisible] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);

  // Leave confirm modal state
  const [leaveConfirmVisible, setLeaveConfirmVisible] = useState(false);
  const [ledgerToLeave, setLedgerToLeave] = useState<Ledger | null>(null);

  const loadLedgers = useCallback(async () => {
    try {
      setIsLoading(true);
      const db = await getDatabase();
      // Only show default ledger + ledgers where user is a member
      const rows = await db.getAllAsync(
        `SELECT l.*,
         (SELECT COUNT(*) FROM ledger_members WHERE ledger_id = l.id) as member_count
         FROM ledgers l
         WHERE l.id = 'default-ledger'
            OR l.id IN (SELECT ledger_id FROM ledger_members WHERE user_id = ?)
         ORDER BY CASE WHEN l.id = 'default-ledger' THEN 0 ELSE 1 END, l.created_at DESC`,
        userId
      );
      setLedgers(
        (rows as any[]).map((r) => ({
          id: r.id,
          name: r.name,
          inviteCode: r.invite_code,
          ownerId: r.owner_id,
          createdAt: r.created_at,
          memberCount: r.member_count || 0,
        }))
      );
    } catch (e) {
      console.error('Failed to load ledgers:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLedgers();
  }, [loadLedgers]);

  // Auto-sync from cloud when entering this page
  useFocusEffect(
    useCallback(() => {
      if (isLoggedIn) {
        fullSync().then(() => loadLedgers()).catch(console.warn);
      }
    }, [isLoggedIn, loadLedgers])
  );

  const handleViewMembers = useCallback(async (ledger: Ledger) => {
    setViewingLedger(ledger);
    setMembersModalVisible(true);
    setLoadingMembers(true);
    try {
      // Try Supabase first for fresh data
      if (isLoggedIn) {
        const { data } = await supabase
          .from('ledger_members')
          .select('user_id, email, role')
          .eq('ledger_id', ledger.id);
        if (data && data.length > 0) {
          setMembers(data as any);
          // Also update local DB
          const db = await getDatabase();
          for (const m of data as any[]) {
            await db.runAsync(
              `INSERT OR REPLACE INTO ledger_members (ledger_id, user_id, email, role)
               VALUES (?, ?, ?, ?)`,
              ledger.id, m.user_id, m.email || '', m.role || 'member'
            );
          }
          setLoadingMembers(false);
          return;
        }
      }
      // Fallback to local
      const db = await getDatabase();
      const rows = await db.getAllAsync<any>(
        'SELECT user_id, email, role FROM ledger_members WHERE ledger_id = ?',
        ledger.id
      );
      setMembers(rows as any);
    } catch (e) {
      console.warn('Failed to load members:', e);
    } finally {
      setLoadingMembers(false);
    }
  }, [isLoggedIn]);

  const handleCreateLedger = async () => {
    if (isCreating) return;
    const name = newLedgerName.trim();
    if (!name) {
      Alert.alert('提示', '请输入账本名称');
      return;
    }

    setIsCreating(true);
    try {
      const db = await getDatabase();
      const id = uuidv4();
      const inviteCode = generateInviteCode();
      const now = new Date().toISOString();

      // Insert ledger locally
      await db.runAsync(
        'INSERT INTO ledgers (id, name, invite_code, owner_id, created_at) VALUES (?, ?, ?, ?, ?)',
        id, name, inviteCode, userId, now
      );

      // Insert member locally
      await db.runAsync(
        'INSERT INTO ledger_members (ledger_id, user_id, email, role) VALUES (?, ?, ?, ?)',
        id, userId, userEmail || '', 'owner'
      );

      // Add to sync queue so it gets uploaded to Supabase
      await db.runAsync(
        'INSERT INTO sync_queue (table_name, record_id, operation, payload) VALUES (?, ?, ?, ?)',
        'ledgers', id, 'insert', JSON.stringify({ id, name, invite_code: inviteCode, owner_id: userId, created_at: now })
      );
      await db.runAsync(
        'INSERT INTO sync_queue (table_name, record_id, operation, payload) VALUES (?, ?, ?, ?)',
        'ledger_members', `${id}_${userId}`, 'insert', JSON.stringify({ ledger_id: id, user_id: userId, email: userEmail, role: 'owner' })
      );

      // Sync to Supabase immediately
      let synced = false;
      try {
        const { error: ledgerErr } = await supabase.from('ledgers').upsert({
          id, name, invite_code: inviteCode, owner_id: userId, created_at: now,
        });
        const { error: memberErr } = await supabase.from('ledger_members').upsert({
          ledger_id: id, user_id: userId, email: userEmail || null, role: 'owner',
        });
        if (!ledgerErr && !memberErr) {
          synced = true;
        } else {
          console.warn('Sync errors:', ledgerErr?.message, memberErr?.message);
        }
      } catch (e) {
        console.warn('Immediate sync failed:', e);
      }

      setCreatedInviteCode(inviteCode);
      await loadLedgers();

      if (!synced) {
        // Notify user that sync failed
        setTimeout(() => {
          Alert.alert(
            '提示',
            '账本已在本地创建，但云端同步失败。请确认已登录账号，联网后会自动同步。'
          );
        }, 500);
      }
    } catch (e: any) {
      Alert.alert('错误', '创建账本失败: ' + (e.message || '未知错误'));
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinLedger = async () => {
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) {
      Alert.alert('提示', '请输入6位邀请码');
      return;
    }

    setJoinLoading(true);

    let db: Awaited<ReturnType<typeof getDatabase>>;
    try {
      db = await getDatabase();
    } catch (e: any) {
      Alert.alert('错误', '数据库初始化失败: ' + (e.message || ''));
      setJoinLoading(false);
      return;
    }

    // Step 1: Check local
    try {
      const localLedger = await db.getFirstAsync<any>(
        'SELECT * FROM ledgers WHERE invite_code = ?', code
      );

      if (localLedger) {
        const existingMember = await db.getFirstAsync<any>(
          'SELECT * FROM ledger_members WHERE ledger_id = ? AND user_id = ?',
          localLedger.id, userId
        );
        if (existingMember) {
          Alert.alert('提示', '你已经是该账本的成员');
          setJoinLoading(false);
          return;
        }

        await db.runAsync(
          'INSERT INTO ledger_members (ledger_id, user_id, email, role) VALUES (?, ?, ?, ?)',
          localLedger.id, userId, userEmail || '', 'member'
        );

        // Sync to Supabase
        try {
          await supabase.from('ledger_members').upsert({
            ledger_id: localLedger.id, user_id: userId, email: userEmail || null, role: 'member',
          }, { onConflict: 'ledger_id,user_id' });
        } catch {}

        setJoinModalVisible(false);
        setJoinCode('');
        setJoinLoading(false);
        await loadLedgers();
        Alert.alert('成功', `已加入账本「${localLedger.name}」`);
        return;
      }
    } catch (e: any) {
      console.warn('Local ledger check failed:', e);
      // Continue to try Supabase
    }

    // Step 2: Try Supabase
    try {
      const { data, error } = await supabase
        .from('ledgers')
        .select('*')
        .eq('invite_code', code)
        .maybeSingle();

      if (error) {
        Alert.alert('查询失败', '无法查询云端账本: ' + error.message);
        setJoinLoading(false);
        return;
      }

      if (!data) {
        Alert.alert(
          '未找到账本',
          '该邀请码对应的账本不存在。\n\n请确认：\n1. 邀请码是否正确\n2. 账本创建者是否已同步到云端',
        );
        setJoinLoading(false);
        return;
      }

      // Insert ledger locally
      await db.runAsync(
        'INSERT OR IGNORE INTO ledgers (id, name, invite_code, owner_id) VALUES (?, ?, ?, ?)',
        data.id, data.name, data.invite_code, data.owner_id
      );

      // Add member locally
      await db.runAsync(
        'INSERT OR IGNORE INTO ledger_members (ledger_id, user_id, email, role) VALUES (?, ?, ?, ?)',
        data.id, userId, userEmail || '', 'member'
      );

      // Register on Supabase
      try {
        await supabase.from('ledger_members').upsert({
          ledger_id: data.id,
          user_id: userId,
          email: userEmail || null,
          role: 'member',
        }, { onConflict: 'ledger_id,user_id' });
      } catch {
        // Will sync later
      }

      setJoinModalVisible(false);
      setJoinCode('');
      setJoinLoading(false);
      await loadLedgers();
      Alert.alert('成功', `已加入账本「${data.name}」`);
    } catch (e: any) {
      Alert.alert('错误', '操作失败: ' + (e.message || '请检查网络连接'));
      setJoinLoading(false);
    }
  };

  const handleLeaveLedger = (ledger: Ledger) => {
    setLedgerToLeave(ledger);
    setLeaveConfirmVisible(true);
  };

  const confirmLeaveLedger = async () => {
    if (!ledgerToLeave) return;
    setLeaveConfirmVisible(false);
    try {
      const db = await getDatabase();
      await db.runAsync(
        'DELETE FROM ledger_members WHERE ledger_id = ? AND user_id = ?',
        ledgerToLeave.id, userId
      );
      await db.runAsync(
        'DELETE FROM ledgers WHERE id = ?',
        ledgerToLeave.id
      );

      if (currentLedgerId === ledgerToLeave.id) {
        setLedger('default-ledger');
      }

      setLedgerToLeave(null);
      await loadLedgers();
    } catch (e: any) {
      Alert.alert('错误', '退出失败: ' + (e.message || '未知错误'));
    }
  };

  const handleSelectLedger = useCallback((id: string) => {
    setLedger(id);
  }, [setLedger]);

  const lastTapRef = React.useRef<{ code: string; time: number }>({ code: '', time: 0 });

  const handleInviteCodeTap = useCallback(async (code: string) => {
    const now = Date.now();
    const last = lastTapRef.current;
    if (last.code === code && now - last.time < 400) {
      // Double tap detected
      lastTapRef.current = { code: '', time: 0 };
      try {
        await Clipboard.setStringAsync(code);
        Alert.alert('已复制', `邀请码「${code}」已复制到剪贴板`);
      } catch {
        Alert.alert('提示', `邀请码：${code}`);
      }
    } else {
      lastTapRef.current = { code, time: now };
    }
  }, []);

  const renderLedgerItem = ({ item }: { item: Ledger }) => {
    const isDefault = item.id === 'default-ledger';
    const isSelected = item.id === currentLedgerId;

    return (
      <View
        style={[
          styles.ledgerItem,
          {
            backgroundColor: colors.card,
            borderColor: isSelected ? colors.primary : colors.border,
            borderWidth: isSelected ? 2 : 1,
          },
        ]}
      >
        <TouchableOpacity
          style={styles.ledgerItemLeft}
          activeOpacity={0.6}
          onPress={() => handleSelectLedger(item.id)}
        >
          <View style={[styles.ledgerIcon, { backgroundColor: isDefault ? colors.primaryLight : colors.border }]}>
            <Ionicons
              name={isDefault ? 'person' : 'people'}
              size={20}
              color={isDefault ? colors.primary : colors.textSecondary}
            />
          </View>
          <View style={styles.ledgerInfo}>
            <Text style={[styles.ledgerName, { color: colors.text }]}>{item.name}</Text>
            {!isDefault && (
              <>
                <View style={styles.ledgerMeta}>
                  <TouchableOpacity
                    onPress={() => handleViewMembers(item)}
                    activeOpacity={0.6}
                    hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                  >
                    <Text style={[styles.ledgerMetaText, { color: colors.primary }]}>
                      {item.memberCount} 位成员 ›
                    </Text>
                  </TouchableOpacity>
                  {item.inviteCode && (
                    <TouchableOpacity
                      onPress={() => handleInviteCodeTap(item.inviteCode!)}
                      activeOpacity={0.6}
                      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                    >
                      <Text style={[styles.ledgerMetaText, { color: colors.primary }]}>
                        {'  |  '}邀请码: {item.inviteCode}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
            {isDefault && (
              <Text style={[styles.ledgerMetaText, { color: colors.textSecondary }]}>
                默认账本
              </Text>
            )}
          </View>
        </TouchableOpacity>
        <View style={styles.ledgerItemRight}>
          {isSelected && (
            <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
          )}
          {!isDefault && !isSelected && (
            <TouchableOpacity
              style={[styles.leaveButton, { borderColor: colors.danger }]}
              onPress={() => handleLeaveLedger(item)}
              activeOpacity={0.6}
            >
              <Text style={[styles.leaveButtonText, { color: colors.danger }]}>退出</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const renderCreateModal = () => (
    <Modal
      visible={createModalVisible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        setCreateModalVisible(false);
        setNewLedgerName('');
        setCreatedInviteCode(null);
      }}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
          {!createdInviteCode ? (
            <>
              <Text style={[styles.modalTitle, { color: colors.text }]}>创建共享账本</Text>
              <TextInput
                style={[
                  styles.modalInput,
                  {
                    backgroundColor: colors.background,
                    color: colors.text,
                    borderColor: colors.border,
                  },
                ]}
                placeholder="输入账本名称"
                placeholderTextColor={colors.textSecondary}
                value={newLedgerName}
                onChangeText={setNewLedgerName}
                maxLength={20}
                autoFocus
              />
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: colors.background }]}
                  onPress={() => {
                    setCreateModalVisible(false);
                    setNewLedgerName('');
                  }}
                >
                  <Text style={[styles.modalButtonText, { color: colors.textSecondary }]}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: colors.primary }]}
                  onPress={handleCreateLedger}
                >
                  <Text style={[styles.modalButtonText, { color: '#FFFFFF' }]}>创建</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <View style={styles.successIconContainer}>
                <Ionicons name="checkmark-circle" size={48} color={colors.income} />
              </View>
              <Text style={[styles.modalTitle, { color: colors.text }]}>创建成功</Text>
              <Text style={[styles.inviteLabel, { color: colors.textSecondary }]}>
                将邀请码分享给朋友即可加入
              </Text>
              <View style={[styles.inviteCodeBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={[styles.inviteCodeText, { color: colors.text }]}>
                  {createdInviteCode}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.modalButtonFull, { backgroundColor: colors.primary }]}
                onPress={() => {
                  setCreateModalVisible(false);
                  setNewLedgerName('');
                  setCreatedInviteCode(null);
                }}
              >
                <Text style={[styles.modalButtonText, { color: '#FFFFFF' }]}>完成</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );

  const renderJoinModal = () => (
    <Modal
      visible={joinModalVisible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        setJoinModalVisible(false);
        setJoinCode('');
      }}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>加入账本</Text>
          <Text style={[styles.joinHint, { color: colors.textSecondary }]}>
            输入6位邀请码加入共享账本
          </Text>
          <TextInput
            style={[
              styles.modalInput,
              styles.codeInput,
              {
                backgroundColor: colors.background,
                color: colors.text,
                borderColor: colors.border,
              },
            ]}
            placeholder="输入邀请码"
            placeholderTextColor={colors.textSecondary}
            value={joinCode}
            onChangeText={(t) => setJoinCode(t.toUpperCase())}
            maxLength={6}
            autoCapitalize="characters"
            autoFocus
          />
          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={[styles.modalButton, { backgroundColor: colors.background }]}
              onPress={() => {
                setJoinModalVisible(false);
                setJoinCode('');
              }}
            >
              <Text style={[styles.modalButtonText, { color: colors.textSecondary }]}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalButton, { backgroundColor: colors.primary }]}
              onPress={handleJoinLedger}
              disabled={joinLoading}
            >
              {joinLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={[styles.modalButtonText, { color: '#FFFFFF' }]}>加入</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>共享账本</Text>
        <View style={styles.placeholder} />
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={ledgers}
          keyExtractor={(item) => item.id}
          renderItem={renderLedgerItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="book-outline" size={48} color={colors.textSecondary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>暂无账本</Text>
            </View>
          }
          ListFooterComponent={
            <View style={styles.footerButtons}>
              {!isLoggedIn && (
                <View style={[styles.loginHintCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} />
                  <Text style={[styles.loginHintText, { color: colors.textSecondary }]}>
                    登录后才能创建或加入共享账本
                  </Text>
                  <TouchableOpacity
                    style={[styles.loginHintBtn, { backgroundColor: colors.primary }]}
                    onPress={() => router.push('/login')}
                  >
                    <Text style={styles.loginHintBtnText}>去登录</Text>
                  </TouchableOpacity>
                </View>
              )}
              {isLoggedIn && (
                <>
                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: colors.primary }]}
                    activeOpacity={0.8}
                    onPress={() => setCreateModalVisible(true)}
                  >
                    <Ionicons name="add-circle-outline" size={20} color="#FFFFFF" />
                    <Text style={styles.actionButtonText}>创建共享账本</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: colors.card, borderColor: colors.primary, borderWidth: 1 }]}
                    activeOpacity={0.8}
                    onPress={() => setJoinModalVisible(true)}
                  >
                    <Ionicons name="enter-outline" size={20} color={colors.primary} />
                    <Text style={[styles.actionButtonText, { color: colors.primary }]}>加入账本</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          }
        />
      )}

      {renderCreateModal()}
      {renderJoinModal()}

      {/* Members modal */}
      <Modal
        visible={membersModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMembersModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {viewingLedger?.name} 的成员
            </Text>
            {loadingMembers ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: 24 }} />
            ) : members.length === 0 ? (
              <Text style={[styles.joinHint, { color: colors.textSecondary }]}>暂无成员数据</Text>
            ) : (
              <View style={{ gap: 10, marginVertical: 12 }}>
                {members.map((m) => (
                  <View
                    key={m.user_id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      padding: 12,
                      backgroundColor: colors.background,
                      borderRadius: 10,
                    }}
                  >
                    <View style={{
                      width: 36, height: 36, borderRadius: 18,
                      backgroundColor: colors.primaryLight,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Ionicons name="person" size={18} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontSize: 14, fontWeight: '500' }} numberOfLines={1}>
                        {m.email || m.user_id.slice(0, 8) + '...'}
                      </Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                        {m.role === 'owner' ? '账本所有者' : '成员'}
                      </Text>
                    </View>
                    {m.user_id === userId && (
                      <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}>我</Text>
                    )}
                  </View>
                ))}
              </View>
            )}
            <TouchableOpacity
              style={[styles.modalButtonFull, { backgroundColor: colors.primary, marginTop: 8 }]}
              onPress={() => setMembersModalVisible(false)}
            >
              <Text style={[styles.modalButtonText, { color: '#FFFFFF' }]}>关闭</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={leaveConfirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => { setLeaveConfirmVisible(false); setLedgerToLeave(null); }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>确认退出</Text>
            <Text style={[styles.leaveConfirmMessage, { color: colors.textSecondary }]}>
              确定要退出账本「{ledgerToLeave?.name}」吗？退出后将无法查看该账本的数据。
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.background }]}
                onPress={() => { setLeaveConfirmVisible(false); setLedgerToLeave(null); }}
              >
                <Text style={[styles.modalButtonText, { color: colors.textSecondary }]}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.danger || '#E57373' }]}
                onPress={confirmLeaveLedger}
              >
                <Text style={[styles.modalButtonText, { color: '#FFFFFF' }]}>退出</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 20,
    height: 56,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  placeholder: {
    width: 40,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  ledgerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  ledgerItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  ledgerIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  ledgerInfo: {
    flex: 1,
  },
  ledgerName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 3,
  },
  ledgerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ledgerMetaText: {
    fontSize: 13,
  },
  ledgerItemRight: {
    marginLeft: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaveButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  leaveButtonText: {
    fontSize: 13,
    fontWeight: '500',
  },
  footerButtons: {
    marginTop: 8,
    gap: 12,
  },
  loginHintCard: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    padding: 24,
    gap: 12,
  },
  loginHintText: {
    fontSize: 14,
    textAlign: 'center',
  },
  loginHintBtn: {
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 10,
    marginTop: 4,
  },
  loginHintBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    height: 50,
    gap: 8,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  modalContent: {
    width: '100%',
    borderRadius: 18,
    padding: 24,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
  },
  modalInput: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    height: 48,
    fontSize: 16,
    marginBottom: 20,
  },
  codeInput: {
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 6,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    borderRadius: 12,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonFull: {
    borderRadius: 12,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  successIconContainer: {
    alignItems: 'center',
    marginBottom: 8,
  },
  inviteLabel: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  inviteCodeBox: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  inviteCodeText: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 8,
  },
  leaveConfirmMessage: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  joinHint: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
});

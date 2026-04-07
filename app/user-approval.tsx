import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTheme } from '../src/theme/ThemeProvider';
import { supabase } from '../src/sync/supabaseClient';
import dayjs from 'dayjs';

interface Registration {
  id: string;
  email: string;
  status: 'pending' | 'approved' | 'rejected';
  requested_at: string;
  reviewed_at: string | null;
}

type TabType = 'pending' | 'approved' | 'rejected';

const TABS: { key: TabType; label: string }[] = [
  { key: 'pending', label: '待审核' },
  { key: 'approved', label: '已通过' },
  { key: 'rejected', label: '已拒绝' },
];

export default function UserApprovalScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<TabType>('pending');
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadRegistrations = useCallback(async (tab: TabType) => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('pending_registrations')
        .select('*')
        .eq('status', tab)
        .order('requested_at', { ascending: false });

      if (error) {
        console.error('Failed to load registrations:', error);
        setRegistrations([]);
      } else {
        setRegistrations((data as Registration[]) || []);
      }
    } catch (e) {
      console.error('Failed to load registrations:', e);
      setRegistrations([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadRegistrations(activeTab);
    }, [activeTab, loadRegistrations])
  );

  const handleApprove = async (item: Registration) => {
    try {
      const { error } = await supabase
        .from('pending_registrations')
        .update({ status: 'approved', reviewed_at: new Date().toISOString() })
        .eq('id', item.id);

      if (error) {
        Alert.alert('错误', '操作失败: ' + error.message);
      } else {
        loadRegistrations(activeTab);
      }
    } catch (e: any) {
      Alert.alert('错误', e.message || '操作失败');
    }
  };

  const handleReject = (item: Registration) => {
    Alert.alert('确认拒绝', `确定要拒绝 ${item.email} 的注册申请吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '拒绝',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase
              .from('pending_registrations')
              .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
              .eq('id', item.id);

            if (error) {
              Alert.alert('错误', '操作失败: ' + error.message);
            } else {
              loadRegistrations(activeTab);
            }
          } catch (e: any) {
            Alert.alert('错误', e.message || '操作失败');
          }
        },
      },
    ]);
  };

  const handleDelete = (item: Registration) => {
    Alert.alert('确认删除', `确定要删除用户 ${item.email} 吗？\n\n删除后该用户将无法登录和同步数据，需重新注册。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase
              .from('pending_registrations')
              .delete()
              .eq('id', item.id);

            if (error) {
              Alert.alert('错误', '删除失败: ' + error.message);
            } else {
              Alert.alert('成功', `已删除用户 ${item.email}`);
              loadRegistrations(activeTab);
            }
          } catch (e: any) {
            Alert.alert('错误', e.message || '删除失败');
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: Registration }) => (
    <View style={[styles.itemCard, { backgroundColor: colors.card }]}>
      <View style={styles.itemInfo}>
        <Text style={[styles.itemEmail, { color: colors.text }]}>{item.email}</Text>
        <Text style={[styles.itemTime, { color: colors.textSecondary }]}>
          {dayjs(item.requested_at).format('YYYY-MM-DD HH:mm')}
        </Text>
      </View>
      {activeTab === 'pending' ? (
        <View style={styles.itemActions}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.income }]}
            activeOpacity={0.8}
            onPress={() => handleApprove(item)}
          >
            <Text style={styles.actionBtnText}>通过</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.danger }]}
            activeOpacity={0.8}
            onPress={() => handleReject(item)}
          >
            <Text style={styles.actionBtnText}>拒绝</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.itemActions}>
          <Text
            style={[
              styles.statusLabel,
              { color: activeTab === 'approved' ? colors.income : colors.danger },
            ]}
          >
            {activeTab === 'approved' ? '已通过' : '已拒绝'}
          </Text>
          <TouchableOpacity
            style={[styles.deleteBtn, { borderColor: colors.danger }]}
            activeOpacity={0.8}
            onPress={() => handleDelete(item)}
          >
            <Ionicons name="trash-outline" size={14} color={colors.danger} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>用户审核</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Tab filters */}
      <View style={styles.tabBar}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.tab,
              activeTab === tab.key && { backgroundColor: colors.primary },
            ]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text
              style={[
                styles.tabText,
                { color: activeTab === tab.key ? '#FFFFFF' : colors.textSecondary },
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={registrations}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="document-text-outline" size={48} color={colors.textSecondary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>暂无记录</Text>
            </View>
          }
        />
      )}
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
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
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
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  itemInfo: {
    flex: 1,
    marginRight: 12,
  },
  itemEmail: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  itemTime: {
    fontSize: 13,
  },
  itemActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
  },
});

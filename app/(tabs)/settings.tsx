import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useThemeStore } from '../../src/stores/themeStore';
import { useAuthStore } from '../../src/stores/authStore';
import { isAdmin } from '../../src/utils/whitelist';
import { supabase } from '../../src/sync/supabaseClient';

type SettingRowProps = {
  label: string;
  onPress?: () => void;
  rightElement?: React.ReactNode;
  showArrow?: boolean;
  colors: ReturnType<typeof useTheme>['colors'];
  isLast?: boolean;
};

function SettingRow({ label, onPress, rightElement, showArrow = false, colors, isLast = false }: SettingRowProps) {
  const content = (
    <View style={[styles.row, !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
      <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
      <View style={styles.rowRight}>
        {rightElement}
        {showArrow && (
          <Ionicons
            name="chevron-forward"
            size={18}
            color={colors.textSecondary}
            style={styles.arrowIcon}
          />
        )}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.6} onPress={onPress}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

export default function SettingsScreen() {
  const { colors, mode } = useTheme();
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const router = useRouter();
  const email = useAuthStore((s) => s.email);
  const [pendingCount, setPendingCount] = useState(0);

  const isDark = mode === 'dark';

  useFocusEffect(
    useCallback(() => {
      if (isAdmin(email)) {
        supabase
          .from('pending_registrations')
          .select('id', { count: 'exact' })
          .eq('status', 'pending')
          .then(({ count }) => {
            setPendingCount(count ?? 0);
          });
      }
    }, [email])
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.pageTitle, { color: colors.text }]}>设置</Text>

        {/* Section: Appearance */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>外观</Text>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <SettingRow
            label="主题模式"
            colors={colors}
            isLast
            rightElement={
              <View style={styles.themeToggle}>
                <Text style={[styles.rowValue, { color: colors.textSecondary }]}>
                  {isDark ? '深色' : '莫兰迪'}
                </Text>
                <Switch
                  value={isDark}
                  onValueChange={toggleTheme}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>
            }
          />
        </View>

        {/* Section: Data */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>数据</Text>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <SettingRow
            label="分类管理"
            showArrow
            colors={colors}
            onPress={() => router.push('/category-manage')}
          />
          <SettingRow
            label="共享账本"
            showArrow
            colors={colors}
            onPress={() => router.push('/ledger-manage')}
          />
          <SettingRow
            label="同步状态"
            colors={colors}
            rightElement={
              <Text style={[styles.rowValue, { color: colors.textSecondary }]}>本地模式</Text>
            }
          />
          <SettingRow
            label="数据管理"
            showArrow
            colors={colors}
            isLast
            onPress={() => router.push('/data-manage')}
          />
        </View>

        {/* Section: Account */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>账户</Text>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          {isAdmin(email) && (
            <SettingRow
              label="用户审核"
              onPress={() => router.push('/user-approval')}
              showArrow
              colors={colors}
              rightElement={
                pendingCount > 0 ? (
                  <View style={{ backgroundColor: '#FF3B30', borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
                    <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '700' }}>{pendingCount}</Text>
                  </View>
                ) : undefined
              }
            />
          )}
          <SettingRow
            label="登录/注册"
            showArrow
            colors={colors}
            isLast
            onPress={() => router.push('/login')}
          />
        </View>

        {/* Section: About */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>关于</Text>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <SettingRow
            label="版本"
            colors={colors}
            isLast
            rightElement={
              <Text style={[styles.rowValue, { color: colors.textSecondary }]}>v1.0.0</Text>
            }
          />
        </View>

        <Text style={[styles.footerText, { color: colors.textSecondary }]}>极简账单</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 48,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '700',
    paddingTop: 12,
    paddingBottom: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    marginLeft: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    borderRadius: 12,
    marginBottom: 24,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 50,
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '400',
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowValue: {
    fontSize: 14,
    marginRight: 4,
  },
  arrowIcon: {
    marginLeft: 2,
  },
  themeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  footerText: {
    textAlign: 'center',
    fontSize: 13,
    marginTop: 8,
    marginBottom: 20,
  },
});

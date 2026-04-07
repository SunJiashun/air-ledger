import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/theme/ThemeProvider';
import { useAuthStore } from '../src/stores/authStore';

type AuthMode = 'login' | 'register';

export default function LoginScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { isLoggedIn, email: userEmail, isLoading, signIn, signUp, signOut } = useAuthStore();

  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [signOutConfirmVisible, setSignOutConfirmVisible] = useState(false);

  const handleSubmit = async () => {
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (!trimmedEmail) {
      setError('请输入邮箱地址');
      return;
    }
    if (!trimmedPassword) {
      setError('请输入密码');
      return;
    }
    if (trimmedPassword.length < 6) {
      setError('密码至少需要6位');
      return;
    }

    setError(null);

    if (mode === 'login') {
      const result = await signIn(trimmedEmail, trimmedPassword);
      if (result.error) {
        setError(result.error);
      } else {
        router.canGoBack() ? router.back() : router.replace('/');
      }
    } else {
      const result = await signUp(trimmedEmail, trimmedPassword);
      if (result.error) {
        setError(result.error);
      } else if (result.status === 'pending') {
        setSubmitted(true);
      } else {
        router.canGoBack() ? router.back() : router.replace('/');
      }
    }
  };

  const handleSignOut = () => {
    setSignOutConfirmVisible(true);
  };

  const confirmSignOut = async () => {
    setSignOutConfirmVisible(false);
    await signOut();
  };

  // Logged in view
  if (isLoggedIn) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => { router.replace('/'); }} style={styles.backButton} activeOpacity={0.6}>
            <Text style={{ fontSize: 22, color: colors.textSecondary }}>✕</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.loggedInContent}>
          <View style={[styles.avatarCircle, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name="person" size={40} color={colors.primary} />
          </View>
          <Text style={[styles.loggedInTitle, { color: colors.text }]}>已登录</Text>
          <Text style={[styles.loggedInEmail, { color: colors.textSecondary }]}>
            {userEmail}
          </Text>

          <TouchableOpacity
            style={[styles.signOutButton, { borderColor: colors.danger }]}
            onPress={handleSignOut}
            activeOpacity={0.6}
          >
            <Text style={[styles.signOutButtonText, { color: colors.danger }]}>退出登录</Text>
          </TouchableOpacity>
        </View>

        <Modal visible={signOutConfirmVisible} transparent animationType="fade" onRequestClose={() => setSignOutConfirmVisible(false)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>确认退出</Text>
              <Text style={[styles.modalMessage, { color: colors.textSecondary }]}>退出登录后将无法同步数据</Text>
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: colors.background }]}
                  onPress={() => setSignOutConfirmVisible(false)}
                >
                  <Text style={[styles.modalButtonText, { color: colors.textSecondary }]}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: colors.danger }]}
                  onPress={confirmSignOut}
                >
                  <Text style={[styles.modalButtonText, { color: '#FFFFFF' }]}>退出登录</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  // Login / Register view
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => { router.replace('/'); }} style={styles.backButton} activeOpacity={0.6}>
            <Text style={{ fontSize: 22, color: colors.textSecondary }}>✕</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          {submitted ? (
            <View style={styles.submittedCard}>
              <Ionicons name="time-outline" size={48} color={colors.primary} />
              <Text style={[styles.submittedTitle, { color: colors.text }]}>注册申请已提交</Text>
              <Text style={[styles.submittedSubtitle, { color: colors.textSecondary }]}>
                等待管理员审核通过后即可登录使用云同步功能。您可以继续使用本地记账功能。
              </Text>
              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: colors.primary }]}
                activeOpacity={0.8}
                onPress={() => router.canGoBack() ? router.back() : router.replace('/')}
              >
                <Text style={styles.submitButtonText}>好的</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={[styles.title, { color: colors.text }]}>
                {mode === 'login' ? '登录' : '注册'}
              </Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                {mode === 'login' ? '登录以同步你的账单数据' : '注册后需管理员审批才能使用云同步'}
              </Text>

              {/* Tab toggle */}
              <View style={[styles.tabContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <TouchableOpacity
                  style={[
                    styles.tab,
                    mode === 'login' && { backgroundColor: colors.primary },
                  ]}
                  onPress={() => {
                    setMode('login');
                    setError(null);
                  }}
                >
                  <Text
                    style={[
                      styles.tabText,
                      { color: mode === 'login' ? '#FFFFFF' : colors.textSecondary },
                    ]}
                  >
                    登录
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.tab,
                    mode === 'register' && { backgroundColor: colors.primary },
                  ]}
                  onPress={() => {
                    setMode('register');
                    setError(null);
                  }}
                >
                  <Text
                    style={[
                      styles.tabText,
                      { color: mode === 'register' ? '#FFFFFF' : colors.textSecondary },
                    ]}
                  >
                    注册
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.form}>
                <View style={[styles.inputWrapper, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Ionicons name="mail-outline" size={18} color={colors.textSecondary} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="邮箱地址"
                    placeholderTextColor={colors.textSecondary}
                    value={email}
                    onChangeText={(t) => {
                      setEmail(t);
                      setError(null);
                    }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                <View style={[styles.inputWrapper, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Ionicons name="lock-closed-outline" size={18} color={colors.textSecondary} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="密码"
                    placeholderTextColor={colors.textSecondary}
                    value={password}
                    onChangeText={(t) => {
                      setPassword(t);
                      setError(null);
                    }}
                    secureTextEntry
                  />
                </View>

                {error && (
                  <View style={[styles.errorBox, { backgroundColor: colors.danger + '18' }]}>
                    <Ionicons name="alert-circle" size={16} color={colors.danger} />
                    <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[
                    styles.submitButton,
                    { backgroundColor: colors.primary },
                    isLoading && { opacity: 0.7 },
                  ]}
                  activeOpacity={0.8}
                  onPress={handleSubmit}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.submitButtonText}>
                      {mode === 'login' ? '登录' : '注册'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 20,
    height: 56,
    zIndex: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 32,
    justifyContent: 'center',
    marginTop: -60,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    marginBottom: 24,
  },
  // Tab toggle
  tabContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 3,
    marginBottom: 24,
  },
  tab: {
    flex: 1,
    borderRadius: 10,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
  },
  // Form
  form: {
    gap: 16,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 50,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    height: '100%',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  errorText: {
    fontSize: 13,
    flex: 1,
  },
  submitButton: {
    paddingLeft:16,
    paddingRight:16,
    borderRadius: 12,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  // Logged in state
  loggedInContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    marginTop: -60,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  loggedInTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  loggedInEmail: {
    fontSize: 15,
    marginBottom: 40,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderRadius: 12,
    height: 50,
    paddingHorizontal: 32,
    gap: 8,
  },
  signOutButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  // Confirm modal
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
    marginBottom: 12,
  },
  modalMessage: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
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
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  // Submitted card
  submittedCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 20,
    marginTop: 40,
  },
  submittedTitle: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  submittedSubtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },
});

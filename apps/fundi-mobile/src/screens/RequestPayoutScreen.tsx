import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  apiClient,
  colors,
  fonts,
  fontSize,
  spacing,
  borderRadius,
  gradients,
  type WalletBalance,
} from '@patafundi/shared';
import { Input } from '../components/ui';

type PayoutMethod = 'mpesa' | 'bank';

const METHODS: Array<{ key: PayoutMethod; label: string }> = [
  { key: 'mpesa', label: 'M-Pesa' },
  { key: 'bank', label: 'Bank Transfer' },
];

export function RequestPayoutScreen({ navigation }: any): JSX.Element {
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PayoutMethod>('mpesa');
  const [destination, setDestination] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const data = await apiClient.getWalletBalance();
        setBalance(data.balance);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const handleSubmit = async (): Promise<void> => {
    const numeric = parseFloat(amount);
    if (!numeric || numeric <= 0) {
      Alert.alert('Invalid amount', 'Please enter a valid amount.');
      return;
    }
    if (balance && numeric > balance.available) {
      Alert.alert('Insufficient balance', 'Amount exceeds your available balance.');
      return;
    }
    if (!destination.trim()) {
      Alert.alert('Destination required', `Please enter your ${method === 'mpesa' ? 'phone number' : 'bank account number'}.`);
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.requestPayout(numeric, method, destination.trim());
      Alert.alert('Payout requested', 'Your payout is being processed.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to request payout';
      Alert.alert('Failed', msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Available Balance</Text>
          <Text style={styles.balanceValue}>KES {balance?.available ?? 0}</Text>
        </View>

        <Text style={styles.sectionTitle}>Amount</Text>
        <View style={styles.amountWrap}>
          <Text style={styles.currencyPrefix}>KES</Text>
          <Input
            value={amount}
            onChangeText={setAmount}
            placeholder="0"
            keyboardType="numeric"
            style={styles.amountInput}
          />
        </View>

        <Text style={styles.sectionTitle}>Method</Text>
        <View style={styles.methodRow}>
          {METHODS.map((m) => (
            <TouchableOpacity
              key={m.key}
              style={[styles.methodChip, method === m.key ? styles.methodChipActive : null]}
              onPress={() => setMethod(m.key)}
            >
              <Ionicons
                name={m.key === 'mpesa' ? 'phone-portrait-outline' : 'business-outline'}
                size={18}
                color={method === m.key ? colors.primaryForeground : colors.textSecondary}
              />
              <Text
                style={[
                  styles.methodChipText,
                  method === m.key ? styles.methodChipTextActive : null,
                ]}
              >
                {m.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Input
          label={method === 'mpesa' ? 'Phone number' : 'Bank account number'}
          value={destination}
          onChangeText={setDestination}
          placeholder={method === 'mpesa' ? '+254712345678' : '0000000000'}
          keyboardType={method === 'mpesa' ? 'phone-pad' : 'numeric'}
        />

        <TouchableOpacity onPress={handleSubmit} disabled={submitting} activeOpacity={0.85}>
          <LinearGradient
            colors={[gradients.primary.start, gradients.primary.end]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.btn}
          >
            {submitting ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={styles.btnText}>Request Payout</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <Text style={styles.note}>
          Payouts are processed within 24 hours. A small fee may apply.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    marginTop: spacing.md,
  },
  balanceLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  balanceValue: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.title,
    color: colors.text,
    marginTop: 4,
  },
  sectionTitle: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.lg,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  amountWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  currencyPrefix: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.xxl,
    color: colors.textSecondary,
    marginRight: spacing.sm,
  },
  amountInput: {
    flex: 1,
    fontSize: fontSize.xxl,
    fontWeight: '700',
    fontFamily: fonts.display,
    paddingVertical: 14,
  },
  methodRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: spacing.lg,
  },
  methodChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  methodChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  methodChipText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  methodChipTextActive: {
    color: colors.primaryForeground,
    fontWeight: '700',
  },
  btn: {
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  btnText: {
    color: colors.primaryForeground,
    fontFamily: fonts.sans,
    fontWeight: '700',
    fontSize: fontSize.lg,
  },
  note: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});

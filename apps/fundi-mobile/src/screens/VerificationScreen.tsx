import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import {
  apiClient,
  colors,
  fonts,
  fontSize,
  spacing,
  borderRadius,
  gradients,
  ScreenHeader,
} from '@patafundi/shared';

type Phase = 'idle' | 'starting' | 'capture' | 'submitting' | 'finishing';

const TOTAL_CHALLENGES = 3;

export function VerificationScreen({ navigation }: any): JSX.Element {
  const [status, setStatus] = useState<string>('unknown');
  const [level, setLevel] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<Phase>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<string>('');
  const [step, setStep] = useState(0);

  const load = async (): Promise<void> => {
    try {
      const data = await apiClient.getVerificationStatus();
      setStatus(data.status ?? 'unknown');
      setLevel(data.level ?? '');
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const isVerified = status === 'verified' || status === 'approved' || level === 'liveness';

  const handleStart = async (): Promise<void> => {
    setPhase('starting');
    try {
      const data = await apiClient.startLiveness();
      const sid = (data as { sessionId?: string }).sessionId ?? null;
      const ch = (data as { challenge?: { prompt?: string } | string }).challenge;
      if (!sid) {
        Alert.alert('Verification failed', 'No session returned. Please try again.');
        setPhase('idle');
        return;
      }
      setSessionId(sid);
      setChallenge(typeof ch === 'string' ? ch : (ch?.prompt ?? 'Look at the camera'));
      setStep(0);
      setPhase('capture');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to start verification';
      Alert.alert('Failed', msg);
      setPhase('idle');
    }
  };

  const captureAndSubmit = async (): Promise<void> => {
    if (!sessionId) return;
    setPhase('submitting');
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.6,
        allowsEditing: false,
      });
      if (result.canceled) {
        setPhase('capture');
        return;
      }
      const asset = result.assets[0];
      await apiClient.submitLivenessFrame(sessionId, {
        uri: asset.uri,
        type: 'image/jpeg',
        name: `frame-${step}.jpg`,
      });
      const nextStep = step + 1;
      if (nextStep >= TOTAL_CHALLENGES) {
        setPhase('finishing');
        const finished = await apiClient.finishLiveness(sessionId);
        const verified = (finished as { verified?: boolean }).verified === true;
        if (verified) {
          Alert.alert('Verified', 'Your identity has been verified successfully.');
          setStatus('verified');
          setLevel('liveness');
          setSessionId(null);
          setStep(0);
          setPhase('idle');
        } else {
          const reason = (finished as { reason?: string }).reason ?? 'Verification did not pass.';
          Alert.alert('Verification failed', reason);
          setSessionId(null);
          setStep(0);
          setPhase('idle');
        }
      } else {
        setStep(nextStep);
        setChallenge(['Look forward', 'Turn head left', 'Smile'][nextStep] ?? 'Look at the camera');
        setPhase('capture');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to submit frame';
      Alert.alert('Failed', msg);
      setPhase('capture');
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
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: spacing.xl }}
    >
      <ScreenHeader title="Verification" onBack={() => navigation.goBack()} />

      <Text style={styles.title}>Identity Verification</Text>
      <Text style={styles.subtitle}>Verify your identity with a quick liveness check.</Text>

      <View style={[styles.statusCard, isVerified ? styles.statusVerified : null]}>
        <Ionicons
          name={isVerified ? 'shield-checkmark' : 'shield-outline'}
          size={28}
          color={isVerified ? colors.success : colors.warning}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.statusTitle}>
            {isVerified ? 'Verified' : status === 'unknown' ? 'Not verified' : 'Pending review'}
          </Text>
          <Text style={styles.statusMeta}>
            {isVerified ? 'You can accept jobs.' : 'Complete verification to start earning.'}
          </Text>
        </View>
      </View>

      {phase === 'idle' ? (
        <>
          <View style={styles.stepsCard}>
            <Text style={styles.stepsTitle}>How it works</Text>
            <View style={styles.stepRow}>
              <Ionicons name="camera-outline" size={20} color={colors.primary} />
              <Text style={styles.stepText}>Take 3 quick selfies following prompts.</Text>
            </View>
            <View style={styles.stepRow}>
              <Ionicons name="eye-outline" size={20} color={colors.primary} />
              <Text style={styles.stepText}>Our system checks liveness in real time.</Text>
            </View>
            <View style={styles.stepRow}>
              <Ionicons name="checkmark-circle-outline" size={20} color={colors.primary} />
              <Text style={styles.stepText}>Get verified and start accepting jobs.</Text>
            </View>
          </View>

          {!isVerified ? (
            <TouchableOpacity onPress={handleStart} activeOpacity={0.85}>
              <LinearGradient
                colors={[gradients.primary.start, gradients.primary.end]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.btn}
              >
                <Text style={styles.btnText}>Start Verification</Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : null}
        </>
      ) : null}

      {(phase === 'capture' || phase === 'submitting' || phase === 'finishing') && sessionId ? (
        <View style={styles.captureCard}>
          <Text style={styles.captureStep}>
            Step {step + 1} of {TOTAL_CHALLENGES}
          </Text>
          <View style={styles.dotsRow}>
            {Array.from({ length: TOTAL_CHALLENGES }).map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i <= step ? styles.dotActive : null]}
              />
            ))}
          </View>
          <Text style={styles.challengeText}>{challenge}</Text>
          <Text style={styles.captureHint}>
            {phase === 'submitting'
              ? 'Submitting…'
              : phase === 'finishing'
                ? 'Finalizing verification…'
                : 'Tap below to capture this frame.'}
          </Text>
          <TouchableOpacity
            onPress={captureAndSubmit}
            disabled={phase !== 'capture'}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={[gradients.accent.start, gradients.accent.end]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.btn}
            >
              {phase !== 'capture' ? (
                <ActivityIndicator color={colors.accentForeground} />
              ) : (
                <>
                  <Ionicons name="camera" size={18} color={colors.accentForeground} />
                  <Text style={[styles.btnText, { color: colors.accentForeground, marginLeft: 6 }]}>
                    Capture
                  </Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      ) : null}
    </ScrollView>
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
  title: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.xxl,
    color: colors.text,
    marginTop: spacing.md,
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: 4,
    marginBottom: spacing.md,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.warning + '1A',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.warning + '40',
    marginBottom: spacing.md,
  },
  statusVerified: {
    backgroundColor: colors.success + '1A',
    borderColor: colors.success + '40',
  },
  statusTitle: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.md,
    color: colors.text,
  },
  statusMeta: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  stepsCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  stepsTitle: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.md,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  stepText: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.text,
  },
  captureCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  captureStep: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 6,
    marginVertical: spacing.sm,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: borderRadius.pill,
    backgroundColor: colors.border,
  },
  dotActive: {
    backgroundColor: colors.primary,
  },
  challengeText: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.lg,
    color: colors.text,
    textAlign: 'center',
    marginVertical: spacing.sm,
  },
  captureHint: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.md,
    paddingVertical: 14,
  },
  btnText: {
    color: colors.primaryForeground,
    fontFamily: fonts.sans,
    fontWeight: '700',
    fontSize: fontSize.lg,
  },
});

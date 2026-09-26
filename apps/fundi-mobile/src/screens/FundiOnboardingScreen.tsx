import React, { useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  colors,
  fonts,
  fontSize,
  spacing,
  borderRadius,
  gradients,
} from '@patafundi/shared';

const { width } = Dimensions.get('window');
const ONBOARDING_KEY = 'fundi_onboarding_complete';

interface Slide {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
}

const SLIDES: Slide[] = [
  {
    icon: 'flash',
    title: 'PataFundi Fundi',
    subtitle: 'Earn money on your schedule. Turn your skills into income.',
  },
  {
    icon: 'briefcase',
    title: 'Thousands of Jobs',
    subtitle: 'Get matched with customers near you and grow your pipeline.',
  },
  {
    icon: 'shield-checkmark',
    title: 'Verified & Trusted',
    subtitle: 'Build your reputation with ratings and reviews from real customers.',
  },
];

interface FundiOnboardingScreenProps {
  onComplete: () => void;
}

export function FundiOnboardingScreen({ onComplete }: FundiOnboardingScreenProps): JSX.Element {
  const [active, setActive] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const finish = async (): Promise<void> => {
    try {
      await AsyncStorage.setItem(ONBOARDING_KEY, '1');
    } catch {
      // ignore storage errors
    }
    onComplete();
  };

  const goNext = (): void => {
    if (active >= SLIDES.length - 1) {
      void finish();
      return;
    }
    const next = active + 1;
    scrollRef.current?.scrollTo({ x: next * width, animated: true });
  };

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>): void => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / width);
    if (idx !== active) setActive(idx);
  };

  return (
    <View style={styles.container}>
      <View style={styles.skipWrap}>
        <TouchableOpacity onPress={() => void finish()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
      >
        {SLIDES.map((slide, idx) => (
          <View key={idx} style={styles.slide}>
            <LinearGradient
              colors={idx === 2 ? [gradients.accent.start, gradients.accent.end] : [gradients.primary.start, gradients.primary.end]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.illustration}
            >
              <Ionicons name={slide.icon} size={48} color={colors.primaryForeground} />
            </LinearGradient>
            <Text style={styles.title}>{slide.title}</Text>
            <Text style={styles.subtitle}>{slide.subtitle}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.dotsRow}>
          {SLIDES.map((_, idx) => (
            <View
              key={idx}
              style={[styles.dot, idx === active ? styles.dotActive : null]}
            />
          ))}
        </View>

        <TouchableOpacity onPress={goNext} activeOpacity={0.85}>
          <LinearGradient
            colors={[gradients.primary.start, gradients.primary.end]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.ctaBtn}
          >
            <Text style={styles.ctaText}>
              {active >= SLIDES.length - 1 ? 'Get Started' : 'Next'}
            </Text>
            <Ionicons
              name={active >= SLIDES.length - 1 ? 'arrow-forward' : 'chevron-forward'}
              size={18}
              color={colors.primaryForeground}
            />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  skipWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    alignItems: 'flex-end',
  },
  skipText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  slide: {
    width,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  illustration: {
    width: 140,
    height: 140,
    borderRadius: borderRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: 28,
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: 22,
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginBottom: spacing.lg,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: borderRadius.pill,
    backgroundColor: colors.border,
  },
  dotActive: {
    backgroundColor: colors.primary,
    width: 24,
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: borderRadius.lg,
  },
  ctaText: {
    fontFamily: fonts.sans,
    fontWeight: '700',
    fontSize: fontSize.lg,
    color: colors.primaryForeground,
  },
});

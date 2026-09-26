/**
 * CreateJobScreen — Customer creates a job request.
 *
 * PRICING MODEL: Customers NEVER set a budget. The platform calculates
 * the price automatically using the pricing engine (base price + distance +
 * time + weather + demand + complexity + emergency).
 *
 * Flow: Category → Description → Complexity → Urgency → Location → Photos →
 *       [Platform calculates price] → Customer accepts price → Job posted
 */

import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import {
  apiClient,
  colors,
  fonts,
  fontSize,
  spacing,
  borderRadius,
  gradients,
  SERVICE_CATEGORIES,
  ScreenHeader,
} from '@patafundi/shared';
import type { PriceBreakdown } from '@patafundi/shared';

interface PhotoAsset {
  uri: string;
  type?: string;
  name?: string;
}

const COMPLEXITY_OPTIONS = [
  { value: 'simple',  label: 'Simple',  desc: 'Quick fix, basic repair',           mult: '1.0x' },
  { value: 'medium',  label: 'Medium',  desc: 'Standard job, moderate effort',     mult: '1.25x' },
  { value: 'complex', label: 'Complex', desc: 'Multi-step, specialized skills',    mult: '1.75x' },
  { value: 'expert',  label: 'Expert',  desc: 'Advanced expertise required',       mult: '2.5x' },
] as const;

export function CreateJobScreen({ navigation, route }: any): JSX.Element {
  const preselected: string | undefined = route?.params?.category;
  const [category, setCategory] = useState<string | null>(preselected ?? null);
  const [description, setDescription] = useState('');
  const [complexity, setComplexity] = useState<'simple' | 'medium' | 'complex' | 'expert'>('simple');
  const [urgency, setUrgency] = useState<'normal' | 'emergency'>('normal');
  const [address, setAddress] = useState('');
  const [county, setCounty] = useState('');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [photos, setPhotos] = useState<PhotoAsset[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Pricing
  const [priceQuote, setPriceQuote] = useState<PriceBreakdown | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [priceAccepted, setPriceAccepted] = useState(false);

  useEffect(() => {
    if (preselected) setCategory(preselected);
  }, [preselected]);

  const detectLocation = async (): Promise<void> => {
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('Location denied', 'Please grant location to continue.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = loc.coords;
      setCoords({ latitude, longitude });
      const geo = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (geo.length > 0) {
        const g = geo[0];
        setAddress([g.name, g.street, g.city, g.region].filter(Boolean).join(', '));
        setCounty(g.region || g.city || '');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to get location';
      Alert.alert('Location error', msg);
    } finally {
      setLocating(false);
    }
  };

  const pickPhotos = async (): Promise<void> => {
    if (photos.length >= 5) {
      Alert.alert('Limit reached', 'You can upload up to 5 photos.');
      return;
    }
    try {
      const remaining = 5 - photos.length;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        quality: 0.7,
      });
      if (result.canceled) return;
      const picked: PhotoAsset[] = result.assets.map((a) => ({
        uri: a.uri,
        type: 'image/jpeg',
        name: `photo-${Date.now()}.jpg`,
      }));
      setPhotos((prev) => [...prev, ...picked].slice(0, 5));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to pick photo';
      Alert.alert('Photo error', msg);
    }
  };

  const removePhoto = (index: number): void => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Calculate platform price ──────────────────────────────
  const calculateQuote = async (): Promise<void> => {
    if (!category) {
      Alert.alert('Select category', 'Please choose a service category.');
      return;
    }
    if (!description.trim()) {
      Alert.alert('Description required', 'Please describe your job.');
      return;
    }
    if (!coords) {
      Alert.alert('Location required', 'Please detect your location.');
      return;
    }
    setCalculating(true);
    setPriceAccepted(false);
    try {
      const response = await apiClient.calculatePrice({
        serviceCategory: category,
        latitude: coords.latitude,
        longitude: coords.longitude,
        county: county || undefined,
        isEmergency: urgency === 'emergency',
        complexity,
      });
      setPriceQuote(response.price);
    } catch (e: any) {
      Alert.alert('Pricing error', e?.message || 'Could not calculate price. Please try again.');
    } finally {
      setCalculating(false);
    }
  };

  // ── Post the job with accepted price ──────────────────────
  const handleSubmit = async (): Promise<void> => {
    if (!priceQuote || !priceAccepted) {
      Alert.alert('Accept price', 'Please calculate and accept the price first.');
      return;
    }
    setSubmitting(true);
    try {
      const { job } = await apiClient.createJob({
        serviceCategory: category!,
        description: description.trim(),
        urgency,
        latitude: coords!.latitude,
        longitude: coords!.longitude,
        address: address.trim() || undefined,
      });
      if (photos.length > 0) {
        try {
          await apiClient.uploadJobPhotos(job.id, photos);
        } catch {
          // photos optional
        }
      }
      Alert.alert('Job posted', 'Your job has been posted. We are matching a fundi.', [
        { text: 'Track', onPress: () => navigation.replace('JobTracking', { jobId: job.id }) },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to post job';
      Alert.alert('Failed', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const canCalculate = category && description.trim() && coords;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: spacing.xl }}
      keyboardShouldPersistTaps="handled"
    >
      <ScreenHeader title="New Job" onBack={() => navigation.goBack()} />

      <Text style={styles.label}>Service category</Text>
      <View style={styles.grid}>
        {SERVICE_CATEGORIES.map((cat) => {
          const selected = category === cat.slug;
          return (
            <TouchableOpacity
              key={cat.slug}
              style={[styles.categoryCard, selected ? styles.categorySelected : null]}
              onPress={() => { setCategory(cat.slug); setPriceQuote(null); }}
            >
              <Ionicons
                name={cat.icon as any}
                size={24}
                color={selected ? colors.primary : cat.color}
              />
              <Text style={[styles.categoryLabel, selected ? styles.categoryLabelSelected : null]}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={styles.textarea}
        value={description}
        onChangeText={(v) => { setDescription(v); setPriceQuote(null); }}
        placeholder="Describe the job, what needs fixing, when you're available..."
        placeholderTextColor={colors.textSecondary}
        multiline
        numberOfLines={4}
        textAlignVertical="top"
      />

      <Text style={styles.label}>Complexity</Text>
      <Text style={styles.hint}>Affects the base price — be honest for accurate quotes</Text>
      <View style={styles.complexityGrid}>
        {COMPLEXITY_OPTIONS.map((opt) => {
          const selected = complexity === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[styles.complexityCard, selected ? styles.complexitySelected : null]}
              onPress={() => { setComplexity(opt.value); setPriceQuote(null); }}
            >
              <View style={styles.complexityHeader}>
                <Text style={[styles.complexityLabel, selected ? styles.complexityLabelSelected : null]}>
                  {opt.label}
                </Text>
                <Text style={[styles.complexityMult, selected ? styles.complexityMultSelected : null]}>
                  {opt.mult}
                </Text>
              </View>
              <Text style={[styles.complexityDesc, selected ? styles.complexityDescSelected : null]}>
                {opt.desc}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.label}>Urgency</Text>
      <View style={styles.urgencyRow}>
        <TouchableOpacity
          style={[styles.urgencyBtn, urgency === 'normal' ? { borderColor: colors.accent, backgroundColor: colors.accent + '15' } : null]}
          onPress={() => { setUrgency('normal'); setPriceQuote(null); }}
        >
          <Text style={[styles.urgencyText, { color: urgency === 'normal' ? colors.accent : colors.textSecondary }]}>Normal</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.urgencyBtn, urgency === 'emergency' ? { borderColor: colors.error, backgroundColor: colors.error + '15' } : null]}
          onPress={() => { setUrgency('emergency'); setPriceQuote(null); }}
        >
          <Text style={[styles.urgencyText, { color: urgency === 'emergency' ? colors.error : colors.textSecondary }]}>Emergency (+15%)</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Location</Text>
      <View style={styles.locationRow}>
        <TouchableOpacity onPress={detectLocation} style={styles.locateBtn} disabled={locating}>
          {locating ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Ionicons name="locate" size={20} color={colors.primary} />
          )}
          <Text style={styles.locateText}>{address || 'Detect my location'}</Text>
        </TouchableOpacity>
      </View>
      {coords ? (
        <Text style={styles.coordsText}>
          {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}
        </Text>
      ) : null}

      <Text style={styles.label}>Photos (up to 5)</Text>
      <View style={styles.photoRow}>
        {photos.map((_p, i) => (
          <View key={i} style={styles.photoBox}>
            <Ionicons name="image" size={22} color={colors.textSecondary} />
            <TouchableOpacity style={styles.removePhoto} onPress={() => removePhoto(i)}>
              <Ionicons name="close-circle" size={18} color={colors.error} />
            </TouchableOpacity>
          </View>
        ))}
        {photos.length < 5 ? (
          <TouchableOpacity style={styles.addPhoto} onPress={pickPhotos}>
            <Ionicons name="add" size={24} color={colors.primary} />
            <Text style={styles.addPhotoText}>Add</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* ── Price Quote — Customer sees ONLY total, ETA, duration ── */}
      {priceQuote ? (
        <View style={styles.priceCard}>
          <View style={styles.priceHeader}>
            <Ionicons name="pricetag" size={20} color={colors.primary} />
            <Text style={styles.priceTitle}>Your Price</Text>
          </View>

          {/* The only number that matters to the customer */}
          <Text style={styles.priceHero}>KES {priceQuote.total.toLocaleString()}</Text>

          {/* Simple meta — arrival + duration only */}
          <View style={styles.priceMetaRow}>
            <View style={styles.priceMetaItem}>
              <Ionicons name="navigate-outline" size={16} color={colors.primary} />
              <View>
                <Text style={styles.priceMetaLabel}>Arrival</Text>
                <Text style={styles.priceMetaValue}>{priceQuote.etaMinutes} min</Text>
              </View>
            </View>
            <View style={styles.priceMetaDivider} />
            <View style={styles.priceMetaItem}>
              <Ionicons name="time-outline" size={16} color={colors.primary} />
              <View>
                <Text style={styles.priceMetaLabel}>Duration</Text>
                <Text style={styles.priceMetaValue}>~{priceQuote.estimatedDurationMinutes} min</Text>
              </View>
            </View>
          </View>

          <Text style={styles.priceTrust}>
            Final price — no hidden fees, no surprises.
          </Text>
        </View>
      ) : null}

      {/* ── Action Buttons ──────────────────────────────────── */}
      {!priceQuote ? (
        <TouchableOpacity onPress={calculateQuote} disabled={!canCalculate || calculating} activeOpacity={0.85}>
          <LinearGradient
            colors={canCalculate ? [gradients.accent.start, gradients.accent.end] : ['#E7E5E4', '#E7E5E4']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.btn}
          >
            {calculating ? (
              <ActivityIndicator color={colors.textLight} />
            ) : (
              <>
                <Ionicons name="pricetag-outline" size={20} color={colors.textLight} />
                <Text style={styles.btnText}>See Price</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      ) : !priceAccepted ? (
        <View style={styles.acceptRow}>
          <TouchableOpacity
            style={styles.declineBtn}
            onPress={() => { setPriceQuote(null); setPriceAccepted(false); }}
          >
            <Text style={styles.declineText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setPriceAccepted(true)}
            activeOpacity={0.85}
            style={{ flex: 1 }}
          >
            <LinearGradient
              colors={[gradients.primary.start, gradients.primary.end]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.btn}
            >
              <Ionicons name="checkmark-circle-outline" size={20} color={colors.textLight} />
              <Text style={styles.btnText}>Accept</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      ) : (
        <View>
          <View style={styles.acceptedBanner}>
            <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            <Text style={styles.acceptedText}>Price accepted — KES {priceQuote.total.toLocaleString()}</Text>
          </View>
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
                <>
                  <Ionicons name="send-outline" size={20} color={colors.textLight} />
                  <Text style={styles.btnText}>Book Now</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}

      <Text style={styles.platformNote}>
        <Ionicons name="shield-checkmark-outline" size={12} color={colors.textSecondary} />
        {'  '}Final price includes everything. No hidden fees, no surprises.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  label: { fontFamily: fonts.sans, fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: 6, marginTop: spacing.md, fontWeight: '500' },
  hint: { fontFamily: fonts.sans, fontSize: fontSize.xs, color: colors.textTertiary || colors.textSecondary, marginBottom: 8, marginTop: -2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  categoryCard: {
    width: '31%', backgroundColor: colors.card, borderRadius: borderRadius.lg,
    padding: spacing.md, alignItems: 'center', marginBottom: spacing.sm,
    borderWidth: 1.5, borderColor: colors.border, gap: 4,
  },
  categorySelected: { borderColor: colors.primary, backgroundColor: colors.primary + '15' },
  categoryLabel: { fontFamily: fonts.sans, fontSize: fontSize.xs, color: colors.text, textAlign: 'center' },
  categoryLabelSelected: { color: colors.primary, fontWeight: '600' },
  textarea: {
    borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.lg,
    padding: 12, backgroundColor: colors.card, fontFamily: fonts.sans,
    fontSize: fontSize.md, color: colors.text, minHeight: 100,
  },
  complexityGrid: { gap: spacing.sm },
  complexityCard: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: borderRadius.lg,
    padding: spacing.md, backgroundColor: colors.card,
  },
  complexitySelected: { borderColor: colors.primary, backgroundColor: colors.primary + '10' },
  complexityHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  complexityLabel: { fontFamily: fonts.sans, fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  complexityLabelSelected: { color: colors.primary },
  complexityMult: { fontFamily: fonts.sans, fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: '600' },
  complexityMultSelected: { color: colors.primary },
  complexityDesc: { fontFamily: fonts.sans, fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  complexityDescSelected: { color: colors.text },
  urgencyRow: { flexDirection: 'row', gap: spacing.sm },
  urgencyBtn: {
    flex: 1, borderWidth: 1.5, borderColor: colors.border, borderRadius: borderRadius.md,
    paddingVertical: 12, alignItems: 'center', backgroundColor: colors.card,
  },
  urgencyText: { fontFamily: fonts.sans, fontWeight: '600', fontSize: fontSize.md },
  locationRow: { flexDirection: 'row', alignItems: 'center' },
  locateBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.lg,
    padding: 12, backgroundColor: colors.card,
  },
  locateText: { flex: 1, fontFamily: fonts.sans, fontSize: fontSize.md, color: colors.text, marginLeft: 8 },
  coordsText: { fontFamily: fonts.sans, fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 4 },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  photoBox: {
    width: 72, height: 72, borderRadius: borderRadius.md, backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', position: 'relative',
  },
  removePhoto: { position: 'absolute', top: -6, right: -6, backgroundColor: colors.card, borderRadius: borderRadius.pill },
  addPhoto: {
    width: 72, height: 72, borderRadius: borderRadius.md, borderWidth: 1.5,
    borderColor: colors.primary, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center',
  },
  addPhotoText: { fontFamily: fonts.sans, fontSize: fontSize.xs, color: colors.primary, marginTop: 2 },
  priceCard: {
    backgroundColor: colors.card, borderRadius: borderRadius.xl, padding: spacing.xl,
    marginTop: spacing.md, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center',
  },
  priceHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.md },
  priceTitle: { fontFamily: fonts.display, fontSize: fontSize.md, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1 },
  priceHero: {
    fontFamily: fonts.display, fontSize: 40, fontWeight: '800', color: colors.primary,
    marginVertical: spacing.sm,
  },
  priceMetaRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.md, marginTop: spacing.md, paddingVertical: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border, width: '100%',
  },
  priceMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  priceMetaDivider: { width: 1, height: 24, backgroundColor: colors.border },
  priceMetaLabel: { fontFamily: fonts.sans, fontSize: fontSize.xs, color: colors.textSecondary },
  priceMetaValue: { fontFamily: fonts.sans, fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  priceTrust: {
    fontFamily: fonts.sans, fontSize: fontSize.xs, color: colors.textSecondary,
    marginTop: spacing.sm, textAlign: 'center',
  },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: borderRadius.md, paddingVertical: 14, marginTop: spacing.xl,
  },
  btnText: { color: colors.primaryForeground, fontFamily: fonts.sans, fontWeight: '700', fontSize: fontSize.lg },
  acceptRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl, alignItems: 'center' },
  declineBtn: { paddingVertical: 14, paddingHorizontal: 20, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border },
  declineText: { fontFamily: fonts.sans, fontSize: fontSize.md, fontWeight: '600', color: colors.textSecondary },
  acceptedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8, padding: spacing.md,
    backgroundColor: colors.successLight || colors.success + '15', borderRadius: borderRadius.md, marginTop: spacing.xl,
  },
  acceptedText: { fontFamily: fonts.sans, fontSize: fontSize.md, fontWeight: '600', color: colors.success },
  platformNote: {
    fontFamily: fonts.sans, fontSize: fontSize.xs, color: colors.textSecondary,
    textAlign: 'center', marginTop: spacing.lg, paddingHorizontal: spacing.md, lineHeight: 18,
  },
});

/**
 * FundiRegisterScreen — Multi-step registration wizard.
 *
 * Flow:
 *   Step 1: Personal Info (fullName, email, phone, password)
 *   Step 2: Professional Info (service categories, experience, bio)
 *   Step 3: Location (county, town — auto-detect or manual)
 *   Step 4: Documents (ID front REQUIRED, ID back, selfie REQUIRED, certificates)
 *   Step 5: M-Pesa + ID Number
 *   Submit → apiClient.registerFundi(FormData) → navigate to Otp
 *
 * Uses expo-image-picker for camera/gallery.
 * Uses expo-location for auto-detect.
 * All documents uploaded as FormData to /auth/register/fundi.
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import {
  apiClient,
  colors,
  gradients,
  fonts,
  spacing,
  fontSize,
  borderRadius,
  shadows,
  SERVICE_CATEGORIES,
} from '@patafundi/shared';

const { width } = Dimensions.get('window');
const TOTAL_STEPS = 5;

const KENYAN_COUNTIES = [
  'Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Kiambu', 'Machakos', 'Kajiado',
  'Uasin Gishu', 'Nyeri', 'Meru', 'Kakamega', 'Bungoma', 'Kilifi', 'Malindi',
  'Eldoret', 'Thika', 'Kitale', 'Garissa', 'Nanyuki', 'Kericho',
];

export function FundiRegisterScreen({ navigation }: any): JSX.Element {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Step 1: Personal
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Step 2: Professional
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [experience, setExperience] = useState('');
  const [bio, setBio] = useState('');

  // Step 3: Location
  const [county, setCounty] = useState('');
  const [town, setTown] = useState('');
  const [locating, setLocating] = useState(false);

  // Step 4: Documents
  const [idFront, setIdFront] = useState<{ uri: string; type?: string; name?: string } | null>(null);
  const [idBack, setIdBack] = useState<{ uri: string; type?: string; name?: string } | null>(null);
  const [selfie, setSelfie] = useState<{ uri: string; type?: string; name?: string } | null>(null);
  const [certificates, setCertificates] = useState<{ uri: string; type?: string; name?: string }[]>([]);

  // Step 5: Payment + ID
  const [mpesaNumber, setMpesaNumber] = useState('');
  const [idNumber, setIdNumber] = useState('');

  // ── Validation per step ──────────────────────────────────────
  const validateStep = (s: number): string | null => {
    switch (s) {
      case 1:
        if (!fullName.trim()) return 'Full name is required';
        if (!email.trim()) return 'Email is required';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Valid email is required';
        if (!phone.trim()) return 'Phone number is required';
        if (password.length < 8) return 'Password must be at least 8 characters';
        return null;
      case 2:
        if (selectedSkills.length === 0) return 'Select at least one service category';
        return null;
      case 3:
        if (!county) return 'County is required';
        if (!town.trim()) return 'Town is required';
        return null;
      case 4:
        if (!idFront) return 'National ID front photo is required';
        if (!selfie) return 'Selfie photo is required for verification';
        return null;
      case 5:
        if (!mpesaNumber.trim()) return 'M-Pesa number is required for payouts';
        if (!idNumber.trim()) return 'National ID number is required';
        return null;
      default:
        return null;
    }
  };

  const nextStep = () => {
    const error = validateStep(step);
    if (error) {
      Alert.alert('Please fix', error);
      return;
    }
    if (step < TOTAL_STEPS) setStep(step + 1);
  };

  const prevStep = () => {
    if (step > 1) setStep(step - 1);
  };

  // ── Image picker ─────────────────────────────────────────────
  const takePhoto = useCallback(async (setter: (img: any) => void) => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Camera permission is required to take photos');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setter({
        uri: result.assets[0].uri,
        type: 'image/jpeg',
        name: `photo-${Date.now()}.jpg`,
      });
    }
  }, []);

  const pickFromGallery = useCallback(async (setter: (img: any) => void) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setter({
        uri: result.assets[0].uri,
        type: 'image/jpeg',
        name: `photo-${Date.now()}.jpg`,
      });
    }
  }, []);

  const showPhotoOptions = (setter: (img: any) => void, isMulti = false) => {
    Alert.alert(
      'Upload Photo',
      'Choose how to upload',
      [
        { text: 'Take Photo', onPress: () => takePhoto(setter) },
        { text: 'Choose from Gallery', onPress: () => pickFromGallery(setter) },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  const addCertificate = () => {
    if (certificates.length >= 5) {
      Alert.alert('Maximum reached', 'You can upload up to 5 certificates');
      return;
    }
    const setter = (img: any) => setCertificates(prev => [...prev, img]);
    showPhotoOptions(setter, true);
  };

  // ── Auto-detect location ─────────────────────────────────────
  const detectLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Location permission is required to auto-detect');
        setLocating(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const reverse = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
      if (reverse[0]) {
        if (reverse[0].region) setCounty(reverse[0].region);
        if (reverse[0].city || reverse[0].subregion) setTown(reverse[0].city || reverse[0].subregion || '');
      }
    } catch {
      Alert.alert('Location error', 'Could not detect your location. Please enter manually.');
    }
    setLocating(false);
  };

  // ── Toggle skill selection ───────────────────────────────────
  const toggleSkill = (slug: string) => {
    setSelectedSkills(prev =>
      prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug],
    );
  };

  // ── Submit registration ──────────────────────────────────────
  const submit = async () => {
    const error = validateStep(5);
    if (error) {
      Alert.alert('Please fix', error);
      return;
    }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('fullName', fullName.trim());
      fd.append('email', email.trim().toLowerCase());
      fd.append('password', password);
      fd.append('phone', phone.trim());
      fd.append('skills', JSON.stringify(selectedSkills));
      fd.append('experience', experience.trim());
      fd.append('bio', bio.trim());
      fd.append('county', county);
      fd.append('town', town.trim());
      fd.append('mpesaNumber', mpesaNumber.trim());
      fd.append('idNumber', idNumber.trim());

      // Required documents
      fd.append('idPhoto', { uri: idFront!.uri, type: 'image/jpeg', name: 'id-front.jpg' } as any);
      fd.append('selfiePhoto', { uri: selfie!.uri, type: 'image/jpeg', name: 'selfie.jpg' } as any);

      // Optional documents
      if (idBack) {
        fd.append('idPhotoBack', { uri: idBack.uri, type: 'image/jpeg', name: 'id-back.jpg' } as any);
      }
      certificates.forEach((cert, i) => {
        fd.append('certificate', { uri: cert.uri, type: 'image/jpeg', name: `cert-${i}.jpg` } as any);
      });

      const data = await apiClient.registerFundi(fd);
      if (data.success) {
        Alert.alert(
          'Registration Successful',
          'Your fundi account has been created. Please verify your email with the OTP sent to ' + email + '.',
          [{ text: 'OK', onPress: () => navigation.navigate('Otp', { email: email.trim().toLowerCase(), devOtp: (data as any).devOtp }) }],
        );
      } else {
        Alert.alert('Registration Failed', data.message || 'Something went wrong');
      }
    } catch (e: any) {
      Alert.alert('Registration Failed', e?.message || 'Please check your details and try again');
    } finally {
      setLoading(false);
    }
  };

  // ── Progress bar ─────────────────────────────────────────────
  const progress = (step / TOTAL_STEPS) * 100;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header with progress */}
      <View style={styles.header}>
        <TouchableOpacity onPress={prevStep} disabled={step === 1} style={styles.backBtn}>
          {step > 1 && <Ionicons name="chevron-back" size={24} color={colors.text} />}
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Become a Fundi</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Progress bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressTrack}>
          <LinearGradient
            colors={[gradients.primary.start, gradients.primary.end]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.progressBar, { width: `${progress}%` }]}
          />
        </View>
        <Text style={styles.stepLabel}>Step {step} of {TOTAL_STEPS}</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Step 1: Personal Info */}
        {step === 1 && (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Personal Information</Text>
            <Text style={styles.stepSubtitle}>Tell us about yourself</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Full Name</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="person-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="John Doe"
                  value={fullName}
                  onChangeText={setFullName}
                  autoCapitalize="words"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="mail-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="john@example.com"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Phone Number</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="call-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="+254712345678"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Min 8 characters"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Step 2: Professional Info */}
        {step === 2 && (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Professional Details</Text>
            <Text style={styles.stepSubtitle}>What services do you offer?</Text>

            <Text style={styles.label}>Service Categories</Text>
            <Text style={styles.hint}>Select all that apply</Text>
            <View style={styles.skillsGrid}>
              {SERVICE_CATEGORIES.map(cat => {
                const selected = selectedSkills.includes(cat.slug);
                return (
                  <TouchableOpacity
                    key={cat.slug}
                    style={[styles.skillChip, selected && styles.skillChipSelected]}
                    onPress={() => toggleSkill(cat.slug)}
                  >
                    <Ionicons
                      name={cat.icon as any}
                      size={18}
                      color={selected ? colors.primary : colors.textSecondary}
                    />
                    <Text style={[styles.skillLabel, selected && styles.skillLabelSelected]}>
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Years of Experience</Text>
              <View style={styles.inputWrap}>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 5"
                  value={experience}
                  onChangeText={setExperience}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Bio (Optional)</Text>
              <TextInput
                style={[styles.input, styles.textarea]}
                placeholder="Tell customers about your expertise..."
                value={bio}
                onChangeText={setBio}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>
          </View>
        )}

        {/* Step 3: Location */}
        {step === 3 && (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Your Location</Text>
            <Text style={styles.stepSubtitle}>Where do you operate?</Text>

            <TouchableOpacity style={styles.detectBtn} onPress={detectLocation} disabled={locating}>
              {locating ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <>
                  <Ionicons name="location-outline" size={20} color={colors.accent} />
                  <Text style={styles.detectBtnText}>Auto-detect my location</Text>
                </>
              )}
            </TouchableOpacity>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>County</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="map-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Select county"
                  value={county}
                  onChangeText={setCounty}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Town / Area</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="pin-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Westlands"
                  value={town}
                  onChangeText={setTown}
                />
              </View>
            </View>
          </View>
        )}

        {/* Step 4: Documents */}
        {step === 4 && (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Verification Documents</Text>
            <Text style={styles.stepSubtitle}>Required for account approval</Text>

            {/* ID Front — REQUIRED */}
            <TouchableOpacity
              style={styles.uploadCard}
              onPress={() => showPhotoOptions(setIdFront)}
            >
              {idFront ? (
                <View style={styles.uploadedPreview}>
                  <View style={styles.uploadedInfo}>
                    <Ionicons name="checkmark-circle" size={24} color={colors.success} />
                    <View>
                      <Text style={styles.uploadedTitle}>ID Front</Text>
                      <Text style={styles.uploadedStatus}>Uploaded ✓</Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => setIdFront(null)}>
                    <Ionicons name="trash-outline" size={20} color={colors.error} />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.uploadPlaceholder}>
                  <Ionicons name="card-outline" size={32} color={colors.primary} />
                  <Text style={styles.uploadTitle}>National ID — Front</Text>
                  <Text style={styles.uploadRequired}>Required</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* ID Back — Optional */}
            <TouchableOpacity
              style={styles.uploadCard}
              onPress={() => showPhotoOptions(setIdBack)}
            >
              {idBack ? (
                <View style={styles.uploadedPreview}>
                  <View style={styles.uploadedInfo}>
                    <Ionicons name="checkmark-circle" size={24} color={colors.success} />
                    <View>
                      <Text style={styles.uploadedTitle}>ID Back</Text>
                      <Text style={styles.uploadedStatus}>Uploaded ✓</Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => setIdBack(null)}>
                    <Ionicons name="trash-outline" size={20} color={colors.error} />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.uploadPlaceholder}>
                  <Ionicons name="card-outline" size={32} color={colors.textSecondary} />
                  <Text style={styles.uploadTitle}>National ID — Back</Text>
                  <Text style={styles.uploadOptional}>Optional</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Selfie — REQUIRED */}
            <TouchableOpacity
              style={styles.uploadCard}
              onPress={() => showPhotoOptions(setSelfie)}
            >
              {selfie ? (
                <View style={styles.uploadedPreview}>
                  <View style={styles.uploadedInfo}>
                    <Ionicons name="checkmark-circle" size={24} color={colors.success} />
                    <View>
                      <Text style={styles.uploadedTitle}>Selfie</Text>
                      <Text style={styles.uploadedStatus}>Uploaded ✓</Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => setSelfie(null)}>
                    <Ionicons name="trash-outline" size={20} color={colors.error} />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.uploadPlaceholder}>
                  <Ionicons name="person-circle-outline" size={32} color={colors.primary} />
                  <Text style={styles.uploadTitle}>Selfie Photo</Text>
                  <Text style={styles.uploadRequired}>Required for verification</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Certificates — Optional */}
            <Text style={styles.label}>Certificates (Optional)</Text>
            <Text style={styles.hint}>Upload up to 5 professional certificates</Text>
            <View style={styles.certificatesRow}>
              {certificates.map((cert, i) => (
                <View key={i} style={styles.certThumb}>
                  <TouchableOpacity
                    style={styles.certRemove}
                    onPress={() => setCertificates(prev => prev.filter((_, idx) => idx !== i))}
                  >
                    <Ionicons name="close" size={14} color={colors.textLight} />
                  </TouchableOpacity>
                  <Ionicons name="document-outline" size={24} color={colors.accent} />
                  <Text style={styles.certLabel} numberOfLines={1}>Cert {i + 1}</Text>
                </View>
              ))}
              {certificates.length < 5 && (
                <TouchableOpacity style={styles.certAdd} onPress={addCertificate}>
                  <Ionicons name="add" size={24} color={colors.textSecondary} />
                  <Text style={styles.certLabel}>Add</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Step 5: Payment + ID Number */}
        {step === 5 && (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Payment & Identity</Text>
            <Text style={styles.stepSubtitle}>For receiving your earnings</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>M-Pesa Phone Number</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="wallet-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Same as phone or different M-Pesa number"
                  value={mpesaNumber}
                  onChangeText={setMpesaNumber}
                  keyboardType="phone-pad"
                />
              </View>
              <Text style={styles.hint}>Your earnings will be sent to this M-Pesa account</Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>National ID Number</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="card-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 12345678"
                  value={idNumber}
                  onChangeText={setIdNumber}
                  keyboardType="numeric"
                />
              </View>
              <Text style={styles.hint}>Must match the ID you uploaded</Text>
            </View>

            {/* Summary */}
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Review Your Application</Text>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Name</Text>
                <Text style={styles.summaryValue} numberOfLines={1}>{fullName}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Services</Text>
                <Text style={styles.summaryValue} numberOfLines={2}>
                  {selectedSkills.length} selected
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Location</Text>
                <Text style={styles.summaryValue} numberOfLines={1}>{town}, {county}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Documents</Text>
                <Text style={styles.summaryValue}>
                  ID ✓ • Selfie ✓{idBack ? ' • ID Back ✓' : ''}{certificates.length > 0 ? ` • ${certificates.length} cert(s)` : ''}
                </Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Footer buttons */}
      <View style={styles.footer}>
        {step < TOTAL_STEPS ? (
          <TouchableOpacity onPress={nextStep} disabled={loading}>
            <LinearGradient
              colors={[gradients.primary.start, gradients.primary.end]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.primaryBtn}
            >
              <Text style={styles.primaryBtnText}>Continue</Text>
              <Ionicons name="arrow-forward" size={20} color={colors.textLight} />
            </LinearGradient>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={submit} disabled={loading}>
            <LinearGradient
              colors={[gradients.primary.start, gradients.primary.end]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.primaryBtn}
            >
              {loading ? (
                <ActivityIndicator color={colors.textLight} />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={20} color={colors.textLight} />
                  <Text style={styles.primaryBtnText}>Submit Application</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.loginLink}>
          <Text style={styles.loginLinkText}>Already have an account? </Text>
          <Text style={styles.loginLinkAction}>Sign In</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xl + spacing.sm,
    paddingBottom: spacing.md,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontFamily: fonts.display, fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  placeholder: { width: 40 },

  progressContainer: { paddingHorizontal: spacing.md, marginBottom: spacing.md },
  progressTrack: { height: 4, backgroundColor: colors.border, borderRadius: borderRadius.pill, overflow: 'hidden' },
  progressBar: { height: '100%', borderRadius: borderRadius.pill },
  stepLabel: { fontFamily: fonts.sans, fontSize: fontSize.xs, color: colors.textSecondary, marginTop: spacing.xs },

  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.md, paddingBottom: spacing.xxl },

  stepContainer: { marginBottom: spacing.xl },
  stepTitle: { fontFamily: fonts.display, fontSize: fontSize.xxl, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  stepSubtitle: { fontFamily: fonts.sans, fontSize: fontSize.md, color: colors.textSecondary, marginBottom: spacing.xl },

  inputGroup: { marginBottom: spacing.lg },
  label: { fontFamily: fonts.sans, fontSize: fontSize.sm, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  hint: { fontFamily: fonts.sans, fontSize: fontSize.xs, color: colors.textSecondary, marginTop: spacing.xs },

  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
  },
  inputIcon: { marginRight: spacing.sm },
  input: { flex: 1, fontFamily: fonts.sans, fontSize: fontSize.md, color: colors.text, paddingVertical: 0 },
  textarea: { height: 100, textAlignVertical: 'top', paddingTop: spacing.sm },
  eyeBtn: { padding: spacing.xs },

  skillsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  skillChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.pill,
    backgroundColor: colors.card,
  },
  skillChipSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLighter },
  skillLabel: { fontFamily: fonts.sans, fontSize: fontSize.sm, color: colors.textSecondary },
  skillLabelSelected: { color: colors.primary, fontWeight: '600' },

  detectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.accentLighter,
    marginBottom: spacing.xl,
  },
  detectBtnText: { fontFamily: fonts.sans, fontSize: fontSize.md, fontWeight: '600', color: colors.accent },

  uploadCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.card,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  uploadPlaceholder: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.xs },
  uploadTitle: { fontFamily: fonts.sans, fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  uploadRequired: { fontFamily: fonts.sans, fontSize: fontSize.xs, color: colors.primary, fontWeight: '600' },
  uploadOptional: { fontFamily: fonts.sans, fontSize: fontSize.xs, color: colors.textSecondary },

  uploadedPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    backgroundColor: colors.successLight,
  },
  uploadedInfo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  uploadedTitle: { fontFamily: fonts.sans, fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  uploadedStatus: { fontFamily: fonts.sans, fontSize: fontSize.xs, color: colors.success },

  certificatesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  certThumb: {
    width: 72,
    height: 72,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    position: 'relative',
  },
  certRemove: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.error,
    justifyContent: 'center',
    alignItems: 'center',
  },
  certLabel: { fontFamily: fonts.sans, fontSize: fontSize.xs, color: colors.textSecondary },
  certAdd: {
    width: 72,
    height: 72,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },

  summaryCard: {
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  summaryTitle: { fontFamily: fonts.display, fontSize: fontSize.md, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.xs },
  summaryLabel: { fontFamily: fonts.sans, fontSize: fontSize.sm, color: colors.textSecondary },
  summaryValue: { fontFamily: fonts.sans, fontSize: fontSize.sm, fontWeight: '600', color: colors.text, maxWidth: '60%' },

  footer: { paddingHorizontal: spacing.md, paddingVertical: spacing.md, gap: spacing.md },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    height: 48,
    borderRadius: borderRadius.lg,
  },
  primaryBtnText: { fontFamily: fonts.sans, fontSize: fontSize.md, fontWeight: '600', color: colors.textLight },
  loginLink: { alignItems: 'center' },
  loginLinkText: { fontFamily: fonts.sans, fontSize: fontSize.sm, color: colors.textSecondary },
  loginLinkAction: { fontFamily: fonts.sans, fontSize: fontSize.sm, fontWeight: '600', color: colors.accent },
});

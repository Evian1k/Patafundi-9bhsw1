import React, { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Dimensions,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
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
import { useAuthStore } from '../store/authStore';

interface PortfolioItem {
  id: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  caption?: string;
  createdAt?: string;
}

const NUM_COLUMNS = 3;
const SCREEN_WIDTH = Dimensions.get('window').width;
const TILE_SIZE = Math.floor((SCREEN_WIDTH - spacing.lg * 2 - (NUM_COLUMNS - 1) * 8) / NUM_COLUMNS);

export function PortfolioScreen({ navigation }: any): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      if (!user?.id) return;
      const data = await apiClient.getFundiPortfolio(user.id);
      setItems((data.portfolio as PortfolioItem[]) || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    void load();
  }, [load]);

  const handleAdd = async (): Promise<void> => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      setUploading(true);
      await apiClient.uploadPortfolioItem({
        uri: asset.uri,
        type: 'image/jpeg',
        name: `portfolio-${Date.now()}.jpg`,
      });
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to upload';
      Alert.alert('Upload failed', msg);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = (id: string): void => {
    Alert.alert('Delete photo?', 'This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(id);
          try {
            await apiClient.deletePortfolioItem(id);
            await load();
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'Failed to delete';
            Alert.alert('Failed', msg);
          } finally {
            setDeleting(null);
          }
        },
      },
    ]);
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
      <ScreenHeader title="Portfolio" onBack={() => navigation.goBack()} />

      <Text style={styles.title}>Portfolio</Text>
      <Text style={styles.subtitle}>Showcase your best work to win more jobs.</Text>

      <View style={styles.grid}>
        {items.map((item) => (
          <View key={item.id} style={styles.tileWrap}>
            {item.imageUrl || item.thumbnailUrl ? (
              <Image
                source={{ uri: item.imageUrl ?? item.thumbnailUrl }}
                style={styles.tile}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.tile, styles.tilePlaceholder]}>
                <Ionicons name="image-outline" size={26} color={colors.textSecondary} />
              </View>
            )}
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={() => handleDelete(item.id)}
              disabled={deleting === item.id}
            >
              {deleting === item.id ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <Ionicons name="trash" size={14} color={colors.primaryForeground} />
              )}
            </TouchableOpacity>
          </View>
        ))}

        <TouchableOpacity style={styles.addTile} onPress={handleAdd} disabled={uploading}>
          {uploading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <>
              <Ionicons name="add-circle-outline" size={26} color={colors.primary} />
              <Text style={styles.addText}>Add Photo</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <TouchableOpacity onPress={handleAdd} disabled={uploading} activeOpacity={0.85}>
        <LinearGradient
          colors={[gradients.primary.start, gradients.primary.end]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.btn}
        >
          {uploading ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={styles.btnText}>Upload New Photo</Text>
          )}
        </LinearGradient>
      </TouchableOpacity>
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: spacing.lg,
  },
  tileWrap: {
    position: 'relative',
  },
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: borderRadius.md,
    backgroundColor: colors.secondary,
  },
  tilePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  deleteBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: borderRadius.pill,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  addText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: '600',
  },
  btn: {
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnText: {
    color: colors.primaryForeground,
    fontFamily: fonts.sans,
    fontWeight: '700',
    fontSize: fontSize.lg,
  },
});

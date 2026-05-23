/**
 * Fundi registration data types.
 */

export interface FundiRegistrationData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  idNumber: string;
  idPhoto: File | null;
  idPhotoBack: File | null;
  selfiePhoto: Blob | null;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  locationDisplayName: string;
  locationCity: string;
  skills: string[];
  experience: string;
  mpesaNumber: string;
}

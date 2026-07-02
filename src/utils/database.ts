import { Frame, VectorObject, Bone, Layer } from '../types';

export interface SavedAnimationRecord {
  savedAt: number;
  email: string;
  fps: number;
  layers: Layer[];
  objects: { [id: string]: VectorObject };
  frames: Frame[];
  bones: Bone[];
}

// Local storage key for our lightweight database
const DB_STORAGE_KEY = 'animastudio_custom_db';

/**
 * Loads the raw database dictionary from LocalStorage.
 */
function getRawDb(): Record<string, SavedAnimationRecord> {
  try {
    const raw = localStorage.getItem(DB_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse animastudio local db, resetting.', e);
    return {};
  }
}

/**
 * Persists the raw database dictionary back to LocalStorage.
 */
function saveRawDb(db: Record<string, SavedAnimationRecord>) {
  try {
    localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(db));
  } catch (e) {
    console.error('Failed to save to local storage database', e);
  }
}

/**
 * Saves a new animation record for a specific user email.
 * Overwrites any previous animation they had saved.
 */
export function saveUserAnimation(
  email: string,
  data: {
    fps: number;
    layers: Layer[];
    objects: { [id: string]: VectorObject };
    frames: Frame[];
    bones: Bone[];
  }
): SavedAnimationRecord {
  const db = getRawDb();
  const normalizedEmail = email.trim().toLowerCase();

  const record: SavedAnimationRecord = {
    savedAt: Date.now(),
    email: normalizedEmail,
    fps: data.fps,
    layers: data.layers,
    objects: data.objects,
    frames: data.frames,
    bones: data.bones,
  };

  db[normalizedEmail] = record;
  saveRawDb(db);
  return record;
}

/**
 * Retrieves a saved animation for a given user email.
 * Crucial check: if the record is older than 1 day (24 hours),
 * it is automatically deleted and returns null.
 */
export function getUserAnimation(email: string): { record: SavedAnimationRecord | null; wasDeleted: boolean } {
  const db = getRawDb();
  const normalizedEmail = email.trim().toLowerCase();
  const record = db[normalizedEmail];

  if (!record) {
    return { record: null, wasDeleted: false };
  }

  const oneDayInMs = 24 * 60 * 60 * 1000;
  const elapsed = Date.now() - record.savedAt;

  if (elapsed > oneDayInMs) {
    // Automatically delete the record because it is older than 1 day
    delete db[normalizedEmail];
    saveRawDb(db);
    return { record: null, wasDeleted: true };
  }

  return { record, wasDeleted: false };
}

/**
 * Explicitly deletes the saved animation record for a given user email.
 */
export function deleteUserAnimation(email: string) {
  const db = getRawDb();
  const normalizedEmail = email.trim().toLowerCase();
  if (db[normalizedEmail]) {
    delete db[normalizedEmail];
    saveRawDb(db);
  }
}

/**
 * Validates the simple if-else Gmail password authentication logic.
 * Simple logic requested: if-else authentication.
 * Criteria: 
 *   - The email MUST end with @gmail.com
 *   - The password MUST match a simple check (e.g., '123456' or 'password')
 */
export function validateSimpleAuth(email: string, password: string): { success: boolean; message: string } {
  const trimmedEmail = email.trim();
  const isGmail = trimmedEmail.toLowerCase().endsWith('@gmail.com') && trimmedEmail.includes('@');

  if (!isGmail) {
    return {
      success: false,
      message: 'Invalid email address. Authentication requires a valid @gmail.com address.',
    };
  }

  // Simple if-else password validation
  if (password === '123456' || password === 'password' || password === 'password123') {
    return {
      success: successResponse(trimmedEmail),
      message: 'Authentication successful!',
    };
  } else {
    return {
      success: false,
      message: 'Incorrect password. (Try using standard passwords like "123456" or "password")',
    };
  }
}

function successResponse(email: string): boolean {
  return true;
}

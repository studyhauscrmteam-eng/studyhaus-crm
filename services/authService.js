import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence
} from "firebase/auth";
import { auth } from "../firebase/firebase.js";
import { normalizePhone, phoneToAuthEmail, authEmailToPhone, isValidPhone } from "./phoneUtils.js";

/**
 * Configure Firebase to persist session locally
 * @returns {Promise<void>}
 */
export const setSessionPersistence = async () => {
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch (error) {
    console.error("Error setting persistence:", error.message);
    throw error;
  }
};

/**
 * Log in a user with email and password
 * @param {string} email - The user's email address
 * @param {string} password - The user's password
 * @returns {Promise<Object>} The authenticated user object
 */
export const login = async (email, password) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } catch (error) {
    console.error("Error during login:", error.message);
    throw error;
  }
};

/**
 * Register a new user with email and password
 * @param {string} email - The new user's email address
 * @param {string} password - The new user's password
 * @returns {Promise<Object>} The newly created user object
 */
export const register = async (email, password) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } catch (error) {
    console.error("Error during registration:", error.message);
    throw error;
  }
};

/**
 * Log out the currently authenticated user
 * @returns {Promise<void>}
 */
export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error during logout:", error.message);
    throw error;
  }
};

/**
 * Send password reset email
 * @param {string} email - The user's email address
 * @returns {Promise<void>}
 */
export const resetPassword = async (email) => {
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error) {
    console.error("Error sending reset email:", error.message);
    throw error;
  }
};

/**
 * Get the currently authenticated user (if any)
 * @returns {Object|null} The user object or null if not logged in
 */
export const getCurrentUser = () => {
  return auth.currentUser;
};

/**
 * Listen for authentication state changes (login, logout)
 * @param {function} callback - Function to execute when auth state changes
 * @returns {function} Unsubscribe function to stop listening
 */
export const onAuthStateChanged = (callback) => {
  return firebaseOnAuthStateChanged(auth, callback);
};

/**
 * Login with phone number or email (normalizes to Firebase Auth email format)
 * @param {string} identifier - Phone number in any format or email
 * @param {string} password - User's password
 * @returns {Promise<Object>} The authenticated user object
 */
export const loginWithPhone = async (identifier, password) => {
  // Check if it's a phone number (contains only digits, spaces, +, -, parentheses)
  const isPhone = /^[\d\s\-\+\(\)]{10,}$/.test(identifier);
  
  let authEmail;
  if (isPhone) {
    if (!isValidPhone(identifier)) {
      throw new Error("Invalid phone number. Please enter a valid 10-digit number.");
    }
    authEmail = phoneToAuthEmail(identifier);
  } else {
    // Assume it's an email
    authEmail = identifier.trim();
  }
  
  return login(authEmail, password);
};

/**
 * Register with phone number
 * @param {string} phone - Phone number in any format
 * @param {string} password - User's password
 * @returns {Promise<Object>} The newly created user object
 */
export const registerWithPhone = async (phone, password) => {
  if (!isValidPhone(phone)) {
    throw new Error("Invalid phone number. Please enter a valid 10-digit number.");
  }
  const authEmail = phoneToAuthEmail(phone);
  return register(authEmail, password);
};

/**
 * Get current user's phone number from auth email
 * @returns {string|null} 10-digit phone or null
 */
export const getCurrentUserPhone = () => {
  const user = auth.currentUser;
  if (!user?.email) return null;
  return authEmailToPhone(user.email);
};

// Re-export phone utilities for convenience
export { normalizePhone, phoneToAuthEmail, authEmailToPhone, isValidPhone } from "./phoneUtils.js";

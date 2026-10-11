
'use client';

import * as OTPAuth from 'otpauth';

/**
 * Utility to generate a unique 16-character Base32 TOTP secret.
 * This is standard for apps like Google/Microsoft Authenticator.
 */
export const generateSecret = (length: number = 16): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let result = '';
  
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    const values = new Uint32Array(length);
    window.crypto.getRandomValues(values);
    for (let i = 0; i < length; i++) {
      result += chars.charAt(values[i] % chars.length);
    }
  } else {
    // Fallback for non-browser environments
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  }
  return result;
};

/**
 * Utility to generate 3 unique 8-character alphanumeric recovery keys.
 */
export const generateRecoveryKeys = (count: number = 3): string[] => {
  const keys: string[] = [];
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  for (let i = 0; i < count; i++) {
    let key = '';
    for (let j = 0; j < 8; j++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    keys.push(key);
  }
  return keys;
};

/**
 * Verifies a TOTP code against a secret.
 */
export const verifyMockTOTP = (secret: string, code: string): boolean => {
  try {
    const totp = new OTPAuth.TOTP({
      issuer: 'DataVault',
      label: 'VaultAccess',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: secret,
    });

    const delta = totp.validate({
      token: code,
      window: 1, // Allow 30 seconds clock drift
    });

    return delta !== null;
  } catch (error) {
    console.error('TOTP Verification Error:', error);
    return false;
  }
};

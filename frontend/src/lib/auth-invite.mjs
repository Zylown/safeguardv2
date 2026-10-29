export function readInviteToken(searchParams) {
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');

  if (type !== 'invite' || !tokenHash || tokenHash.length > 4096) {
    return null;
  }

  return tokenHash;
}

export function getPasswordValidationError(password, confirmation) {
  if (password !== confirmation) return 'password-mismatch';
  if (password.length < 12) return 'password-too-short';
  if (password.length > 128) return 'password-too-long';
  return null;
}

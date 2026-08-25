import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/**
 * Argon2id password hashing.
 *
 * Parameters follow OWASP's recommendation (64 MiB, 3 iterations, 4 lanes),
 * which is a good balance for a self-hosted restaurant backend. Plaintext
 * passwords are never stored, logged, or returned.
 */
@Injectable()
export class PasswordService {
  // `raw: false` pins the string-returning overload of argon2.hash().
  private readonly options: argon2.HashOptions & { raw?: false } = {
    type: argon2.argon2id,
    memoryCost: 65_536,
    timeCost: 3,
    parallelism: 4,
  };

  hash(plain: string): Promise<string> {
    return argon2.hash(plain, this.options);
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      // A malformed stored hash must read as "wrong password", never as a crash.
      return false;
    }
  }

  /**
   * Constant-ish work factor for unknown accounts, so an attacker cannot use
   * response timing to enumerate which emails exist.
   */
  async fakeVerify(): Promise<void> {
    await argon2.hash('timing-equalisation-placeholder', this.options);
  }
}

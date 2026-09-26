import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppException } from '../../common/exceptions/app.exception';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import {
  buildReview,
  INVOICE_PROMPT,
  parsePersianNumber,
  scannedInvoiceSchema,
  type InvoiceReview,
} from './invoice-scan.types';

/** Image types a camera or gallery will realistically produce. */
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Reads a photographed supplier invoice into purchase lines.
 *
 * The model's reply is treated as untrusted input: it is parsed against a
 * schema, every number is recomputed, and the result goes to a review screen
 * before anything is written. Nothing here posts stock or money on its own -
 * a misread digit must cost a correction, not an inventory discrepancy.
 */
@Injectable()
export class InvoiceScanService {
  private readonly logger = new Logger(InvoiceScanService.name);

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  get isConfigured(): boolean {
    return this.config.vision.provider !== 'none' && !!this.config.vision.apiKey;
  }

  async scan(file: {
    buffer: Buffer;
    mimetype: string;
    size: number;
  }): Promise<InvoiceReview> {
    if (!this.isConfigured) {
      throw AppException.validation(
        'اسکن فاکتور فعال نیست. کلید سرویس هوش مصنوعی در تنظیمات سرور ثبت نشده است.',
        { vision: ['VISION_API_KEY تنظیم نشده است.'] },
      );
    }
    if (!file?.buffer?.length) {
      throw AppException.validation('تصویری دریافت نشد.');
    }
    if (!ALLOWED.has(file.mimetype)) {
      throw AppException.validation('فقط عکس JPG، PNG یا WebP پشتیبانی می‌شود.');
    }
    if (file.size > MAX_BYTES) {
      throw AppException.validation('حجم عکس بیش از حد مجاز است (حداکثر ۸ مگابایت).');
    }

    const raw = await this.ask(file);
    const parsed = scannedInvoiceSchema.safeParse(coerceNumbers(raw));
    if (!parsed.success) {
      this.logger.warn(`unusable scan reply: ${parsed.error.issues[0]?.message}`);
      throw AppException.validation(
        'فاکتور خوانده نشد. لطفاً عکس واضح‌تری بگیرید یا ردیف‌ها را دستی وارد کنید.',
      );
    }
    if (parsed.data.lines.length === 0) {
      throw AppException.validation(
        'در این عکس ردیف کالایی پیدا نشد. مطمئن شوید کل فاکتور در کادر است.',
      );
    }
    return buildReview(parsed.data);
  }

  /** One call to the vision model. Kept separate so a driver can be swapped. */
  private async ask(file: { buffer: Buffer; mimetype: string }): Promise<unknown> {
    const { apiKey, model, baseUrl } = this.config.vision;

    let response: Response;
    try {
      response = await fetch(`${baseUrl.replace(/\/+$/, '')}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: file.mimetype,
                    data: file.buffer.toString('base64'),
                  },
                },
                { type: 'text', text: INVOICE_PROMPT },
              ],
            },
          ],
        }),
        // A photo of a dense invoice takes a while; failing fast is worse than
        // waiting, because the alternative is retyping the whole thing.
        signal: AbortSignal.timeout(90_000),
      });
    } catch (error) {
      this.logger.error(`vision request failed: ${(error as Error).message}`);
      throw AppException.validation(
        'ارتباط با سرویس اسکن برقرار نشد. لطفاً دوباره تلاش کنید.',
      );
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.error(`vision ${response.status}: ${body.slice(0, 300)}`);
      throw AppException.validation(
        response.status === 401
          ? 'کلید سرویس اسکن معتبر نیست.'
          : 'سرویس اسکن در حال حاضر پاسخ نمی‌دهد.',
      );
    }

    const payload = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text = (payload.content ?? [])
      .filter((part) => part.type === 'text')
      .map((part) => part.text ?? '')
      .join('')
      .trim();

    return extractJson(text);
  }
}

/**
 * Pull the JSON object out of a reply.
 *
 * Models sometimes wrap JSON in a markdown fence or add a sentence around it,
 * so the outermost braces are located rather than assuming a bare object.
 */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Numbers that arrived as strings become numbers.
 *
 * Asked for JSON numbers, a model still sometimes returns "۱۲٬۵۰۰". Coercing
 * here means the schema can stay strict about types.
 */
export function coerceNumbers(input: unknown): unknown {
  if (input == null || typeof input !== 'object') return input;
  const row = input as Record<string, unknown>;

  const fix = (key: string) => {
    const value = parsePersianNumber(row[key]);
    if (value != null) row[key] = value;
    else if (typeof row[key] === 'string') row[key] = null;
  };

  fix('statedTotal');
  fix('confidence');

  if (Array.isArray(row.lines)) {
    row.lines = row.lines
      .map((line) => {
        if (line == null || typeof line !== 'object') return null;
        const entry = line as Record<string, unknown>;
        const quantity = parsePersianNumber(entry.quantity);
        const unitCost = parsePersianNumber(entry.unitCost);
        if (quantity == null || unitCost == null) return null;
        return { ...entry, quantity, unitCost };
      })
      // A row whose numbers could not be read is dropped rather than guessed:
      // the review screen shows what was read, and the owner adds the rest.
      .filter(Boolean);
  }
  return row;
}

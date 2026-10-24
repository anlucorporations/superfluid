import { createHash, createHmac, randomBytes } from 'node:crypto';
import dgram from 'node:dgram';
import type {
  AuthorizeRequest,
  CommandResult,
  GatewayAdapter,
  GatewayHealth,
} from './types.js';

export const RADIUS_CODE = {
  ACCESS_ACCEPT: 2,
  STATUS_SERVER: 12,
  DISCONNECT_REQUEST: 40,
  DISCONNECT_ACK: 41,
  DISCONNECT_NAK: 42,
  COA_REQUEST: 43,
  COA_ACK: 44,
  COA_NAK: 45,
} as const;

export interface RadiusConfig {
  host: string;
  port: number;
  secret: string;
  nasIp: string;
  timeoutMs?: number;
  retries?: number;
}

interface Attr {
  type: number;
  value: Buffer;
}

function stringAttr(type: number, value: string): Attr {
  return { type, value: Buffer.from(value, 'utf8') };
}

function ipAttr(type: number, ip: string): Attr {
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    throw new Error(`IP inválida: ${ip}`);
  }
  return { type, value: Buffer.from(parts) };
}

function uint32Attr(type: number, n: number): Attr {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0, 0);
  return { type, value: b };
}

/** WISPr VSA: vendor-id 14122 (0x372A). */
function wisprBandwidth(vendorType: number, bps: number): Attr {
  const value = Buffer.alloc(4);
  value.writeUInt32BE(bps >>> 0, 0);
  const vendor = Buffer.alloc(6);
  vendor.writeUInt32BE(14122, 0);
  vendor.writeUInt8(vendorType, 4);
  vendor.writeUInt8(value.length + 2, 5);
  return { type: 26, value: Buffer.concat([vendor, value]) };
}

function encodeAttrs(attrs: Attr[]): Buffer {
  return Buffer.concat(
    attrs.map((a) => {
      const b = Buffer.alloc(2 + a.value.length);
      b.writeUInt8(a.type, 0);
      b.writeUInt8(2 + a.value.length, 1);
      a.value.copy(b, 2);
      return b;
    }),
  );
}

function md5(...parts: Buffer[]): Buffer {
  const h = createHash('md5');
  for (const p of parts) h.update(p);
  return h.digest();
}

/** Construye un paquete RADIUS con Message-Authenticator y Request Authenticator (RFC 5176). */
export function buildRadiusPacket(
  code: number,
  identifier: number,
  attrs: Attr[],
  secret: string,
): Buffer {
  const secretBuf = Buffer.from(secret, 'utf8');
  const withMa = [...attrs, { type: 80, value: Buffer.alloc(16) }]; // Message-Authenticator
  const attrsZero = encodeAttrs(withMa);
  const length = 20 + attrsZero.length;
  const headerZero = Buffer.alloc(4);
  headerZero.writeUInt8(code, 0);
  headerZero.writeUInt8(identifier, 1);
  headerZero.writeUInt16BE(length, 2);

  const ra0 = md5(headerZero, Buffer.alloc(16), attrsZero, secretBuf);
  const ma = createHmac('md5', secretBuf)
    .update(Buffer.concat([headerZero, ra0, attrsZero]))
    .digest();
  const finalAttrs = encodeAttrs([...attrs, { type: 80, value: ma }]);
  const ra = md5(headerZero, Buffer.alloc(16), finalAttrs, secretBuf);
  return Buffer.concat([headerZero, ra, finalAttrs]);
}

export interface RadiusResponse {
  code: number;
  identifier: number;
  valid: boolean;
}

/** Verifica el Response Authenticator de la respuesta (RFC 2865). */
export function parseRadiusResponse(
  packet: Buffer,
  requestAuthenticator: Buffer,
  secret: string,
): RadiusResponse | null {
  if (packet.length < 20) return null;
  const code = packet.readUInt8(0);
  const identifier = packet.readUInt8(1);
  const length = packet.readUInt16BE(2);
  if (length > packet.length) return null;
  const auth = packet.subarray(4, 20);
  const attrs = packet.subarray(20, length);
  const expected = md5(
    Buffer.from([code, identifier, 0, 0]),
    Buffer.alloc(0),
    requestAuthenticator,
    attrs,
    Buffer.from(secret, 'utf8'),
  );
  // Recalcular el header con la longitud real:
  const h = Buffer.alloc(4);
  h.writeUInt8(code, 0);
  h.writeUInt8(identifier, 1);
  h.writeUInt16BE(length, 2);
  const expected2 = md5(h, requestAuthenticator, attrs, Buffer.from(secret, 'utf8'));
  return { code, identifier, valid: auth.equals(expected2) || auth.equals(expected) };
}

/**
 * Adaptador Opción B (brief §3.B): RADIUS CoA (RFC 5176) + Disconnect-Request (PoD).
 * `authorize` envía CoA-Request; `disconnect` envía Disconnect-Request; `healthcheck`
 * envía un CoA a una MAC aleatoria y acepta ACK/NAK como prueba de vida.
 */
export class RadiusGatewayAdapter implements GatewayAdapter {
  readonly vendor = 'radius' as const;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly secret: string;

  constructor(private readonly cfg: RadiusConfig) {
    this.timeoutMs = cfg.timeoutMs ?? 2_000;
    this.retries = cfg.retries ?? 1;
    this.secret = cfg.secret;
  }

  private baseAttrs(mac: string, ip: string): Attr[] {
    return [ipAttr(4, this.cfg.nasIp), stringAttr(31, mac), ipAttr(8, ip)];
  }

  private async send(code: number, attrs: Attr[]): Promise<{ response: RadiusResponse | null; latencyMs: number }> {
    const identifier = randomIntByte();
    const packet = buildRadiusPacket(code, identifier, attrs, this.secret);
    const requestAuth = packet.subarray(4, 20);
    const started = Date.now();

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      const result = await this.sendOnce(packet, identifier, requestAuth);
      if (result) return { response: result, latencyMs: Date.now() - started };
    }
    return { response: null, latencyMs: Date.now() - started };
  }

  private sendOnce(
    packet: Buffer,
    identifier: number,
    requestAuth: Buffer,
  ): Promise<RadiusResponse | null> {
    return new Promise((resolve) => {
      const socket = dgram.createSocket('udp4');
      const timer = setTimeout(() => {
        socket.close();
        resolve(null);
      }, this.timeoutMs);
      socket.on('message', (msg) => {
        const parsed = parseRadiusResponse(msg, requestAuth, this.secret);
        if (parsed && parsed.identifier === identifier) {
          clearTimeout(timer);
          socket.close();
          resolve(parsed);
        }
      });
      socket.on('error', () => {
        clearTimeout(timer);
        socket.close();
        resolve(null);
      });
      socket.send(packet, this.cfg.port, this.cfg.host, (err) => {
        if (err) {
          clearTimeout(timer);
          socket.close();
          resolve(null);
        }
      });
    });
  }

  async authorize(req: AuthorizeRequest): Promise<CommandResult> {
    const attrs = [
      ...this.baseAttrs(req.mac, req.ip),
      uint32Attr(27, 3600), // Session-Timeout
      wisprBandwidth(8, req.bandwidthDownBps), // WISPr-Bandwidth-Max-Down
      wisprBandwidth(7, req.bandwidthUpBps), // WISPr-Bandwidth-Max-Up
    ];
    const { response, latencyMs } = await this.send(RADIUS_CODE.COA_REQUEST, attrs);
    if (!response) return { ok: false, latencyMs, ack: false, error: 'timeout' };
    if (response.code === RADIUS_CODE.COA_ACK) return { ok: true, code: 'CoA-ACK', latencyMs, ack: true };
    return { ok: false, code: `radius_${response.code}`, latencyMs, ack: false, error: 'coa_nak' };
  }

  async confirm(req: AuthorizeRequest): Promise<CommandResult> {
    return this.authorize(req);
  }

  async disconnect(req: { sessionId: string; mac: string; ip: string }): Promise<CommandResult> {
    const { response, latencyMs } = await this.send(RADIUS_CODE.DISCONNECT_REQUEST, [
      ...this.baseAttrs(req.mac, req.ip),
    ]);
    if (!response) return { ok: false, latencyMs, ack: false, error: 'timeout' };
    if (response.code === RADIUS_CODE.DISCONNECT_ACK) {
      return { ok: true, code: 'Disconnect-ACK', latencyMs, ack: true };
    }
    return { ok: false, code: `radius_${response.code}`, latencyMs, ack: false, error: 'disconnect_nak' };
  }

  async healthcheck(): Promise<GatewayHealth> {
    const mac = `02:00:00:${randomIntByte().toString(16).padStart(2, '0')}:00:01`;
    const { response, latencyMs } = await this.send(RADIUS_CODE.COA_REQUEST, [
      ...this.baseAttrs(mac, '10.255.255.254'),
    ]);
    return {
      online: response !== null,
      latencyMs,
      detail: response ? `radius_${response.code}` : 'timeout',
    };
  }
}

function randomIntByte(): number {
  return randomBytes(1).readUInt8(0);
}

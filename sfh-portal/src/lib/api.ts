const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const err = body as { error?: string; detail?: string } | null;
    throw new Error(err?.error ?? `HTTP ${res.status}`);
  }
  return body as T;
}

export interface PortalSessionResponse {
  session_id: string;
  expires_at: string;
}

export interface BindingResponse {
  binding_id: string;
  wallet_address: string;
}

export interface SessionView {
  id: string;
  status: string;
  access_mode: string;
  mac: string;
  ip: string;
  wallet_address: string;
  rate: string;
  min_rate: string;
  authorized_at: string | null;
  provisional_until: string | null;
  disconnect_reason: string | null;
}

export function createPortalSession(bindToken: string, noticeVersion: string): Promise<PortalSessionResponse> {
  return apiFetch('/v1/portal/sessions', {
    method: 'POST',
    headers: { authorization: `Bearer ${bindToken}` },
    body: JSON.stringify({ notice_version: noticeVersion, notice_accepted_at: new Date().toISOString() }),
  });
}

export function createWalletBinding(args: {
  sessionId: string;
  wallet: string;
  message: string;
  signature: string;
}): Promise<BindingResponse> {
  return apiFetch('/v1/portal/bindings', {
    method: 'POST',
    body: JSON.stringify({
      session_id: args.sessionId,
      wallet_address: args.wallet,
      message: args.message,
      signature: args.signature,
    }),
  });
}

export function requestAuthorize(args: {
  portalSessionId: string;
  bindingId: string;
  txHash: string;
  flowRateWei: string;
}): Promise<{ session_id: string; status: string }> {
  return apiFetch('/v1/session/authorize', {
    method: 'POST',
    body: JSON.stringify({
      portal_session_id: args.portalSessionId,
      device_binding_id: args.bindingId,
      tx_hash: args.txHash,
      flow_rate_wei_s: args.flowRateWei,
    }),
  });
}

export function getSession(sessionId: string): Promise<SessionView> {
  return apiFetch(`/v1/session/${sessionId}`);
}

export function pauseSession(sessionId: string): Promise<{ status: string }> {
  return apiFetch('/v1/session/pause', { method: 'POST', body: JSON.stringify({ session_id: sessionId }) });
}

export function resumeSession(sessionId: string): Promise<{ status: string }> {
  return apiFetch('/v1/session/resume', { method: 'POST', body: JSON.stringify({ session_id: sessionId }) });
}

export function generateVoucher(
  parentSessionId: string,
  opts?: { maxChildren?: number; bandwidthPercent?: number },
): Promise<{ voucher_id: string; code: string; valid_to: string }> {
  return apiFetch('/v1/vouchers', {
    method: 'POST',
    body: JSON.stringify({
      parent_session_id: parentSessionId,
      max_children: opts?.maxChildren,
      bandwidth_percent: opts?.bandwidthPercent,
    }),
  });
}

export function redeemVoucher(args: {
  code: string;
  portalSessionId: string;
  bindingId: string;
  mac: string;
  ip: string;
}): Promise<{ session_id: string; status: string }> {
  return apiFetch('/v1/vouchers/redeem', {
    method: 'POST',
    body: JSON.stringify({
      code: args.code,
      portal_session_id: args.portalSessionId,
      device_binding_id: args.bindingId,
      mac: args.mac,
      ip: args.ip,
    }),
  });
}

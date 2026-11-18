// helpers/wallet-mock.ts — FASE 3
// Proveedor EIP-1193 SIMULADO inyectado vía addInitScript para wallets solo-tienda
// (Phantom, Coinbase, Trust, OKX) y para la plataforma desktop (Chromium sin wallet real).
//
// ⚠️ Corrección sobre el enunciado: chainId 31337 en hex es **0x7a69** (no 0x7a89).
//    El enunciado mezclaba dígitos; los .feature de FASE 2 usan 0x7a69 y ese es el valor correcto.
//
// Métodos implementados (caja negra de la dApp, NO es una wallet real):
//  - eth_accounts / eth_requestAccounts → [cuenta de prueba] (o [] si sinCuentas=true)
//  - eth_chainId → '0x7a69' (31337) · net_version → '31337'
//  - wallet_switchEthereumChain → OK para 0x7a69; 4902 para otra red; emite chainChanged
//  - wallet_addEthereumChain → OK; emite chainChanged (etiqueta "Besu Codecrypto", moneda CC)
//  - personal_sign → firma DETERMINISTA (no criptográficamente válida) de la cuenta de prueba
//  - eth_signTypedData_v4 → firma EIP-712 DETERMINISTA (mismo aviso)
//  - eth_getBalance / eth_sendTransaction → valores deterministas
//  - Eventos accountsChanged / chainChanged vía dispatchEvent
//
// LIMITACIÓN DOCUMENTADA (regla 9): las firmas deterministas NO pasan ecrecover del backend.
// En modo simulada solo se validan detección, conexión y UX; los flujos que exigen verificación
// criptográfica del backend (SIWE verify, EIP-712 cambio de wallet) requerirán build real o
// quedarán como limitación del plan maestro. Se documenta en el README y en el detalle del resultado.

import type { Wallet } from './catalogo-wallets.ts';

export interface ConfigMock {
  cuenta: string;              // cuenta EIP-1193 que "devuelve" la wallet simulada
  wallet: Wallet;              // para marcar isMetaMask/isPhantom etc.
  chainIdHex?: string;         // por defecto '0x7a69' (31337)
  sinCuentas?: boolean;        // simula "la wallet no devolvió ninguna cuenta" (ESC-004)
  rechazarFirma?: boolean;     // simula rechazo de personal_sign / signTypedData_v4
  rechazarConexion?: boolean;  // simula rechazo de eth_requestAccounts
}

/** Firma determinista de 65 bytes (r‖s‖v) derivada de sha256 del mensaje. NO es una firma ECDSA real. */
function firmaDeterministaScript(): string {
  return `
    async function firmaDeterminista(hexMensaje) {
      const bytes = new Uint8Array((hexMensaje || '0x').replace(/^0x/, '').match(/.{1,2}/g)?.map(b => parseInt(b, 16)) || []);
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
      const r = digest.slice(0, 32);
      const s = new Uint8Array(32); s.set(digest.slice(0, 32));
      const v = new Uint8Array([27]);
      const hex = (arr) => Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
      return '0x' + hex(r) + hex(s) + hex(v);
    }
    async function firmaEip712Determinista(payload) {
      const canon = typeof payload === 'string' ? payload : JSON.stringify(payload);
      const bytes = new TextEncoder().encode(canon);
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
      const r = digest.slice(0, 32);
      const s = new Uint8Array(32); s.set(digest.slice(32, 64));
      const v = new Uint8Array([27]);
      const hex = (arr) => Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
      return '0x' + hex(r) + hex(s) + hex(v);
    }
  `;
}

/** Devuelve el script de inicialización (string) que inyecta el proveedor simulado. */
export function scriptWalletMock(cfg: ConfigMock): string {
  const conf = JSON.stringify({
    cuenta: cfg.cuenta,
    wallet: cfg.wallet,
    chainIdHex: cfg.chainIdHex ?? '0x7a69',
    sinCuentas: !!cfg.sinCuentas,
    rechazarFirma: !!cfg.rechazarFirma,
    rechazarConexion: !!cfg.rechazarConexion,
  });
  return `
    (() => {
      const conf = ${conf};
      ${firmaDeterministaScript()}
      class ProveedorSimulado extends EventTarget {
        constructor() { super(); this._cuentas = conf.sinCuentas ? [] : [conf.cuenta]; }
        _emitir(nombre, dato) { this.dispatchEvent(new Event(nombre)); try { window.dispatchEvent(new CustomEvent(nombre, { detail: dato })); } catch {} }
        isMetaMask = conf.wallet === 'metamask';
        isPhantom = conf.wallet === 'phantom';
        isCoinbaseWallet = conf.wallet === 'coinbase';
        isTrust = conf.wallet === 'trust';
        isOkxWallet = conf.wallet === 'okx';
        isBraveWallet = conf.wallet === 'brave';
        isRabby = conf.wallet === 'rabby';
        _esAnvil(p) { return (p?.chainId || '').toLowerCase() === conf.chainIdHex; }
        async request(arg) {
          const { method, params = [] } = arg || {};
          switch (method) {
            case 'eth_accounts':
            case 'eth_requestAccounts': {
              if (method === 'eth_requestAccounts' && conf.rechazarConexion) {
                throw Object.assign(new Error('Conexión rechazada por el usuario (simulada)'), { code: 4001 });
              }
              this._emitir('accountsChanged', this._cuentas);
              return this._cuentas;
            }
            case 'eth_chainId': return conf.chainIdHex;
            case 'net_version': return parseInt(conf.chainIdHex, 16).toString();
            case 'wallet_switchEthereumChain': {
              if (!this._esAnvil(params[0])) {
                throw Object.assign(new Error('Cadena no añadida (simulada)'), { code: 4902 });
              }
              this._emitir('chainChanged', conf.chainIdHex);
              return null;
            }
            case 'wallet_addEthereumChain': {
              this._emitir('chainChanged', params[0]?.chainId || conf.chainIdHex);
              return null; // red "añadida" con la etiqueta que envía la dApp ("Besu Codecrypto", CC)
            }
            case 'personal_sign': {
              if (conf.rechazarFirma) throw Object.assign(new Error('Firma rechazada por el usuario (simulada)'), { code: 4001 });
              return firmaDeterminista(params[0]);
            }
            case 'eth_signTypedData_v4':
            case 'eth_signTypedData': {
              if (conf.rechazarFirma) throw Object.assign(new Error('Firma rechazada por el usuario (simulada)'), { code: 4001 });
              return firmaEip712Determinista(params[1]);
            }
            case 'eth_getBalance': return '0x56bc75e2d63100000'; // 100 ETH deterministas
            case 'eth_sendTransaction': {
              if (conf.rechazarFirma) throw Object.assign(new Error('Transacción rechazada (simulada)'), { code: 4001 });
              return '0x' + 'e2'.repeat(32); // hash de transacción determinista
            }
            case 'eth_getTransactionReceipt': {
              return null; // "pendiente": el interprete de pasos decide si el escenario exige confirmación
            }
            case 'wallet_getPermissions': return [{ eth_accounts: this._cuentas }];
            default: return null;
          }
        }
        enable() { return this.request({ method: 'eth_requestAccounts' }); }
      }
      const proveedor = new ProveedorSimulado();
      // EIP-1193 estándar + EIP-6963 básico (anuncio del proveedor)
      window.ethereum = proveedor;
      try {
        window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
          detail: Object.freeze({
            info: { uuid: crypto.randomUUID(), name: conf.wallet, icon: 'data:,', rdns: 'simulada.' + conf.wallet },
            provider: proveedor,
          }),
        }));
      } catch {}
      window.addEventListener('eip6963:requestProvider', () => {
        window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
          detail: Object.freeze({ info: { uuid: crypto.randomUUID(), name: conf.wallet, icon: 'data:,', rdns: 'simulada.' + conf.wallet }, provider: proveedor }),
        }));
      });
    })();
  `;
}

/** Inyecta el proveedor simulado en un contexto de Playwright (page/context.addInitScript). */
export async function instalarWalletMock(ctx: { addInitScript: (s: string) => Promise<void> }, cfg: ConfigMock): Promise<void> {
  await ctx.addInitScript(scriptWalletMock(cfg));
}

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FORBIDDEN_KEYS = new Set([
  'user_id', 'userId', 'email', 'phone', 'device_id', 'deviceId',
  'ip', 'ip_address', 'session_id', 'sessionId', 'accuracy', 'altitude',
  'speed', 'heading', 'auth_id', 'sub',
]);

const MOCK_MARKER = /\b(mock|fake|seed|sample|dummy|placeholder)\b/i;

export interface GuardOptions {
  endpoint: string;
  gridSize: number;
  allowedKeys?: string[]; // e.g. ['unique_users']
}

export interface GuardViolation {
  type: 'pii_key' | 'mock_marker' | 'non_grid_coordinate';
  detail: string;
  path?: string;
}

function isMultipleOf(value: number, step: number): boolean {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return false;
  const ratio = value / step;
  return Math.abs(ratio - Math.round(ratio)) < 1e-6;
}

function walk(
  node: unknown,
  path: string,
  opts: GuardOptions,
  violations: GuardViolation[],
  allowed: Set<string>,
): void {
  if (node === null || node === undefined) return;
  if (Array.isArray(node)) {
    // GeoJSON coordinate arrays: [lng, lat] or [[lng,lat],[lng,lat]]
    if (node.length === 2 && typeof node[0] === 'number' && typeof node[1] === 'number'
      && /coordinates/.test(path)) {
      const [lng, lat] = node as [number, number];
      if (!isMultipleOf(lng, opts.gridSize) || !isMultipleOf(lat, opts.gridSize)) {
        violations.push({
          type: 'non_grid_coordinate',
          detail: `[${lng}, ${lat}] not snapped to ${opts.gridSize}`,
          path,
        });
      }
      return;
    }
    node.forEach((v, i) => walk(v, `${path}[${i}]`, opts, violations, allowed));
    return;
  }
  if (typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.has(k) && !allowed.has(k)) {
        violations.push({ type: 'pii_key', detail: k, path: `${path}.${k}` });
      }
      walk(v, `${path}.${k}`, opts, violations, allowed);
    }
  }
}

export function inspectPayload(payload: unknown, opts: GuardOptions): GuardViolation[] {
  const violations: GuardViolation[] = [];
  const allowed = new Set(opts.allowedKeys ?? []);
  walk(payload, '$', opts, violations, allowed);
  try {
    const serialized = JSON.stringify(payload);
    if (MOCK_MARKER.test(serialized)) {
      violations.push({ type: 'mock_marker', detail: 'response contains mock/seed/sample marker' });
    }
  } catch {
    /* noop */
  }
  return violations;
}

/**
 * Inspect the outgoing payload and, if violations are found, log to console
 * (for staging/production log alerting) and write a structured row to
 * security_audit_logs so admins can alert/dashboard on it.
 * Never throws — guard failures must not break the user-facing response.
 */
export async function guardLocationResponse(
  payload: unknown,
  opts: GuardOptions,
  context: { clientIp: string; userAgent: string | null },
): Promise<GuardViolation[]> {
  const violations = inspectPayload(payload, opts);
  if (violations.length === 0) return violations;

  // Always surface to function logs — picked up by log-based alerts.
  console.error(
    `[ANONYMIZATION_ALERT] endpoint=${opts.endpoint} ip=${context.clientIp} ` +
    `violations=${violations.length}`,
    JSON.stringify(violations.slice(0, 10)),
  );

  try {
    const client = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    await client.from('security_audit_logs').insert({
      event_type: 'anonymization_violation',
      endpoint: opts.endpoint,
      client_ip: context.clientIp,
      user_agent: context.userAgent,
      request_count: 1,
      time_window_seconds: 0,
      details: {
        grid_size: opts.gridSize,
        violation_count: violations.length,
        violations: violations.slice(0, 25),
      },
    });
  } catch (err) {
    console.error('[ANONYMIZATION_ALERT] failed to persist audit row:', err);
  }

  return violations;
}
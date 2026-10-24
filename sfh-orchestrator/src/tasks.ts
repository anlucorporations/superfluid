export interface Task {
  queue: string;
  url: string;
  payload: Record<string, unknown>;
  scheduleTime?: Date;
}

export interface TaskQueue {
  enqueue(task: Task): Promise<void>;
}

/** Cola en memoria para desarrollo/tests (no durable; Cloud Tasks en producción). */
export class MemoryTaskQueue implements TaskQueue {
  readonly tasks: Task[] = [];
  async enqueue(task: Task): Promise<void> {
    this.tasks.push(task);
  }
}

export interface CloudTasksConfig {
  project: string;
  location: string;
  /** Email de la service account para el token OIDC de la tarea. */
  serviceAccountEmail: string;
  /** Devuelve un access token válido (metadata server / env). */
  getAccessToken: () => Promise<string>;
}

/**
 * Cola durable D44: Cloud Tasks con reintentos y OIDC. Cada 202 de `/authorize`
 * encola una tarea; apagar la instancia no pierde la validación.
 */
export class CloudTasksQueue implements TaskQueue {
  constructor(private readonly cfg: CloudTasksConfig) {}

  async enqueue(task: Task): Promise<void> {
    const token = await this.cfg.getAccessToken();
    const parent = `projects/${this.cfg.project}/locations/${this.cfg.location}/queues/${task.queue}`;
    const body: Record<string, unknown> = {
      task: {
        httpRequest: {
          httpMethod: 'POST',
          url: task.url,
          headers: { 'Content-Type': 'application/json' },
          body: Buffer.from(JSON.stringify(task.payload)).toString('base64'),
          oidcToken: { serviceAccountEmail: this.cfg.serviceAccountEmail },
        },
      },
    };
    if (task.scheduleTime) {
      body['task'] = {
        ...(body['task'] as Record<string, unknown>),
        scheduleTime: task.scheduleTime.toISOString(),
      };
    }
    const res = await fetch(`https://cloudtasks.googleapis.com/v2/${parent}/tasks`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`Cloud Tasks ${res.status}: ${await res.text()}`);
    }
  }
}

/** Access token desde el metadata server de Cloud Run/GCE. */
export async function metadataAccessToken(): Promise<string> {
  const res = await fetch(
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
    { headers: { 'Metadata-Flavor': 'Google' } },
  );
  if (!res.ok) throw new Error(`metadata token ${res.status}`);
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error('metadata token vacío');
  return json.access_token;
}

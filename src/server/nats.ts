import { connect, NatsConnection } from 'nats'

export const TOPIC_SUPERVISOR = 'epik.supervisor'
export const TOPIC_WORKER_0 = 'epik.worker.0'
export const TOPIC_WORKER_1 = 'epik.worker.1'
export const TOPIC_WORKER_2 = 'epik.worker.2'
export const TOPIC_LOG = 'epik.log'

let connection: NatsConnection | null = null

export async function getNatsConnection(): Promise<NatsConnection> {
  if (connection === null || connection.isClosed()) {
    connection = await connect({ servers: 'nats://localhost:4222' })
  }
  return connection
}

export async function closeNatsConnection(): Promise<void> {
  if (connection !== null && !connection.isClosed()) {
    await connection.close()
    connection = null
  }
}

process.on('SIGINT', async () => {
  await closeNatsConnection()
  process.exit(0)
})

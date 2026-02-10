export type SessionItem = { session_key: string }

export type MessageItem = {
  id: string
  sender_name: string
  content: string
  is_from_bot: boolean
  timestamp: string
}

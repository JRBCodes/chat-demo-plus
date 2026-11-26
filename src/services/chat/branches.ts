import type { Message, ReplyBlock, Session } from './types.js'

/** 将线性消息列表规范化为单分支，保留消息 ID、内容及时间。 */
export const normalizeSession = (session: Session): Session =>
  session.rootMessageId !== undefined
    ? session
    : {
        ...session,
        rootMessageId: session.messages[0]?.id ?? null,
        messages: session.messages.map((message, index, messages) => ({
          ...message,
          parentId: messages[index - 1]?.id ?? null,
          selectedChildId: messages[index + 1]?.id,
        })),
      }

/** 展示内容与请求上下文共用当前选中的分支路径。 */
export const getVisibleMessages = (session: Session): Message[] => {
  if (session.rootMessageId === undefined) {
    return session.messages
  }
  const byId = new Map(session.messages.map((message) => [message.id, message]))
  const path: Message[] = []
  let id = session.rootMessageId
  while (id) {
    const message = byId.get(id)
    if (!message) {
      break
    }
    path.push(message)
    byId.delete(id)
    id = message.selectedChildId ?? null
  }
  return path
}

export type MessageVersions = { ids: string[]; index: number }

/** 一次遍历收集兄弟版本；版本列表未变化时复用旧对象与索引，避免流式正文更新重绘历史消息。 */
export const buildMessageVersions = (
  session: Session,
  previous: ReadonlyMap<string, MessageVersions>
): ReadonlyMap<string, MessageVersions> => {
  const groups = new Map<string | null | undefined, string[]>()
  for (const message of session.messages) {
    const key = session.rootMessageId === undefined ? message.id : message.parentId
    const ids = groups.get(key)
    if (ids) {
      ids.push(message.id)
    } else {
      groups.set(key, [message.id])
    }
  }

  const versions = new Map<string, MessageVersions>()
  let unchanged = previous.size === session.messages.length
  for (const ids of groups.values()) {
    const cachedIds = previous.get(ids[0])?.ids
    const stableIds =
      cachedIds?.length === ids.length && ids.every((id, index) => id === cachedIds[index])
        ? cachedIds
        : ids
    ids.forEach((id, index) => {
      const cached = previous.get(id)
      const version =
        cached?.ids === stableIds && cached.index === index ? cached : { ids: stableIds, index }
      versions.set(id, version)
      if (version !== cached) {
        unchanged = false
      }
    })
  }
  return unchanged ? previous : versions
}

/** 新消息挂在指定父节点下，并选择新分支；原节点与其后续对话保持不变。 */
export const appendBranch = (
  original: Session,
  parentId: string | null,
  messages: Message[]
): Session => {
  const session = normalizeSession(original)
  const first = messages[0]
  if (!first) {
    return session
  }
  return {
    ...session,
    rootMessageId: parentId === null ? first.id : session.rootMessageId,
    messages: [
      ...session.messages.map((message) =>
        message.id === parentId ? { ...message, selectedChildId: first.id } : message
      ),
      ...messages.map((message, index) => ({
        ...message,
        parentId: messages[index - 1]?.id ?? parentId,
        selectedChildId: messages[index + 1]?.id,
      })),
    ],
  }
}

/** 仅允许切换当前路径上某一节点的兄弟版本，恢复该版本已选中的后续分支。 */
export const selectVersion = (original: Session, messageId: string): Session => {
  const session = normalizeSession(original)
  const message = session.messages.find((item) => item.id === messageId)
  if (!message || !getVisibleMessages(session).some((item) => item.parentId === message.parentId)) {
    return original
  }
  return {
    ...session,
    rootMessageId: message.parentId === null ? message.id : session.rootMessageId,
    messages: session.messages.map((item) =>
      item.id === message.parentId ? { ...item, selectedChildId: message.id } : item
    ),
  }
}

/** 删除消息的结果：新会话与被删除的消息（用于撤销和清理原件） */
export type RemoveResult = { session: Session; removed: Message[] }

/** 消息及其全部后代（含未选中的其他版本）的 id */
export const getSubtreeIds = (session: Session, messageId: string): Set<string> => {
  const ids = new Set<string>([messageId])
  const queue = [messageId]
  for (let index = 0; index < queue.length; index += 1) {
    const parentId = queue[index]
    for (const message of session.messages) {
      if (message.parentId === parentId && !ids.has(message.id)) {
        ids.add(message.id)
        queue.push(message.id)
      }
    }
  }
  return ids
}

/** 删除单条消息：直接子消息接替它的位置，后续对话与各版本自己的选择保持不变。 */
export const removeMessage = (original: Session, messageId: string): RemoveResult | null => {
  const session = normalizeSession(original)
  const message = session.messages.find((item) => item.id === messageId)
  if (!message) {
    return null
  }
  const parentId = message.parentId ?? null
  const children = session.messages.filter((item) => item.parentId === messageId)
  /** 顶替它的下一条：优先沿用原有选择，其次取第一个子消息 */
  const nextId = message.selectedChildId ?? children[0]?.id
  return {
    session: {
      ...session,
      rootMessageId: parentId === null ? (nextId ?? null) : session.rootMessageId,
      messages: session.messages.flatMap((item): Message[] => {
        if (item.id === messageId) {
          return []
        }
        if (item.parentId === messageId) {
          return [{ ...item, parentId }]
        }
        if (item.id === parentId && item.selectedChildId === messageId) {
          return [{ ...item, selectedChildId: nextId }]
        }
        return [item]
      }),
    },
    removed: [message],
  }
}

/** 删除消息及其全部后代（含其他版本）；父节点改选同组最近的剩余消息，版本仍可切换。 */
export const removeMessageAndBelow = (
  original: Session,
  messageId: string
): RemoveResult | null => {
  const session = normalizeSession(original)
  const message = session.messages.find((item) => item.id === messageId)
  if (!message) {
    return null
  }
  const removedIds = getSubtreeIds(session, messageId)
  const parentId = message.parentId ?? null
  const siblings = session.messages.filter((item) => item.parentId === parentId)
  const index = siblings.findIndex((item) => item.id === messageId)
  const candidates = siblings.filter((item) => !removedIds.has(item.id))
  // 优先选删除位置之后的第一个版本，没有则退回前一个，避免同组版本无法再切换
  const nextId =
    candidates.find((item) => siblings.indexOf(item) > index)?.id ?? candidates.at(-1)?.id
  return {
    session: {
      ...session,
      rootMessageId: parentId === null ? (nextId ?? null) : session.rootMessageId,
      messages: session.messages.flatMap((item): Message[] => {
        if (removedIds.has(item.id)) {
          return []
        }
        if (item.id === parentId && item.selectedChildId === messageId) {
          return [{ ...item, selectedChildId: nextId }]
        }
        return [item]
      }),
    },
    removed: session.messages.filter((item) => removedIds.has(item.id)),
  }
}

/** 覆盖回答正文：保留思考与工具块，正文合并为一个文本块追加在末尾；拒绝与模板提示不可编辑。 */
export const replaceReplyText = (
  original: Session,
  messageId: string,
  text: string
): Session => {
  const session = normalizeSession(original)
  const message = session.messages.find((item) => item.id === messageId)
  if (
    !message ||
    message.role !== 'assistant' ||
    message.stopReason === 'refusal' ||
    text.trim() === '' ||
    message.blocks.some((block) => block.type === 'text' && block.isTemplate) ||
    !message.blocks.some((block) => block.type === 'text')
  ) {
    return original
  }
  return {
    ...session,
    messages: session.messages.map((item) => {
      if (item.id !== messageId || item.role !== 'assistant') {
        return item
      }
      const blocks: ReplyBlock[] = [
        ...item.blocks.filter((block) => block.type !== 'text'),
        { type: 'text', text },
      ]
      return { ...item, blocks }
    }),
  }
}

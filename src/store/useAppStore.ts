import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { get as getVal, set as setVal, del as delVal } from 'idb-keyval';
import { fetchBalance, BalanceInfo } from '../services/balanceService';
import { AppSettings, ChatMessage, Part, ImageHistoryItem, Session } from '../types';
import { createThumbnail } from '../utils/imageUtils';

// Custom IndexedDB storage
const storage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    return await getVal(name) || null;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await setVal(name, value);
  },
  removeItem: async (name: string): Promise<void> => {
    await delVal(name);
  },
};

interface AppState {
  apiKey: string | null;
  settings: AppSettings;
  messages: ChatMessage[]; // Active session messages
  imageHistory: ImageHistoryItem[];
  isLoading: boolean;
  isSettingsOpen: boolean;
  inputText: string;
  balance: BalanceInfo | null;
  installPrompt: any | null;
  sessions: Session[];
  activeSessionId: string | null;
  isSessionPanelOpen: boolean;
  isSwitchingSession: boolean;

  setInstallPrompt: (prompt: any) => void;
  setApiKey: (key: string) => void;
  fetchBalance: () => Promise<void>;
  updateSettings: (newSettings: Partial<AppSettings>) => void;
  addMessage: (message: ChatMessage) => void;
  updateLastMessage: (parts: Part[], isError?: boolean, thinkingDuration?: number) => void;
  addImageToHistory: (image: ImageHistoryItem) => Promise<void>;
  deleteImageFromHistory: (id: string) => Promise<void>;
  clearImageHistory: () => Promise<void>;
  cleanInvalidHistory: () => Promise<void>;
  setLoading: (loading: boolean) => void;
  setInputText: (text: string) => void;
  toggleSettings: () => void;
  clearHistory: () => void;
  removeApiKey: () => void;
  deleteMessage: (id: string) => void;
  sliceMessages: (index: number) => void;
  // Session management
  createSession: () => Promise<void>;
  switchSession: (id: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  renameSession: (id: string, title: string) => void;
  toggleSessionPanel: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      apiKey: null,
      settings: {
        resolution: '1K',
        aspectRatio: 'Auto',
        useGrounding: false,
        enableThinking: true,
        streamResponse: true,
        customEndpoint: 'https://api.ikuncode.cc',
        modelName: 'gemini-3-pro-image-preview',
        theme: 'system',
        isPro: true,
        sendWithModifier: false, // 默认 Enter 发送
        enableCdnImageProcessing: true, // 默认启用 CDN 图片处理
      },
      messages: [],
      imageHistory: [], // 初始化图片历史记录
      isLoading: false,
      isSettingsOpen: window.innerWidth > 640, // Open by default only on desktop (sm breakpoint)
      inputText: '',
      balance: null,
      installPrompt: null,
      sessions: [],
      activeSessionId: null,
      isSessionPanelOpen: false,
      isSwitchingSession: false,

      setInstallPrompt: (prompt) => set({ installPrompt: prompt }),
      setApiKey: (key) => set({ apiKey: key }),

      fetchBalance: async () => {
        const { apiKey, settings } = get();
        if (!apiKey) return;
        try {
          const balance = await fetchBalance(apiKey, settings);
          set({ balance });
        } catch (error) {
          console.error('Failed to update balance:', error);
        }
      },
      
      updateSettings: (newSettings) => 
        set((state) => ({ settings: { ...state.settings, ...newSettings } })),

      addMessage: (message) =>
        set((state) => {
          const newMessages = [...state.messages, message];
          // Update active session metadata
          const sessions = state.sessions.map(s => {
            if (s.id === state.activeSessionId) {
              const firstUserMsg = newMessages.find(m => m.role === 'user');
              const textPart = firstUserMsg?.parts.find(p => p.text);
              const autoTitle = !s.title && textPart
                ? textPart.text!.slice(0, 30) + (textPart.text!.length > 30 ? '...' : '')
                : s.title;
              return {
                ...s,
                title: autoTitle || s.title,
                updatedAt: Date.now(),
                messageCount: newMessages.length,
                preview: textPart?.text?.slice(0, 50) || s.preview,
              };
            }
            return s;
          });
          return { messages: newMessages, sessions };
        }),

      updateLastMessage: (parts, isError = false, thinkingDuration) =>
        set((state) => {
            const messages = [...state.messages];

            if (messages.length > 0) {
                messages[messages.length - 1] = {
                    ...messages[messages.length - 1],
                    parts: [...parts], // Create a copy to trigger re-renders
                    isError: isError,
                    ...(thinkingDuration !== undefined && { thinkingDuration })
                };
            }

            return { messages };
        }),

      addImageToHistory: async (image) => {
        // 分离存储：生成缩略图存入 State，原图存入 IDB
        let thumbnail = image.thumbnailData;
        if (!thumbnail && image.base64Data) {
            try {
                thumbnail = await createThumbnail(image.base64Data, image.mimeType);
            } catch (e) {
                console.error('Failed to create thumbnail', e);
            }
        }

        // 如果有原图数据，存入 IDB 并从 State 对象中移除
        if (image.base64Data) {
            try {
                await setVal(`image_data_${image.id}`, image.base64Data);
            } catch (e) {
                console.error('Failed to save image data to IDB', e);
            }
        }

        const newImageItem: ImageHistoryItem = {
            ...image,
            thumbnailData: thumbnail,
            base64Data: undefined // 不在 State 中存储原图
        };

        set((state) => {
          // 最多保留100张图片
          const newHistory = [newImageItem, ...state.imageHistory].slice(0, 100);
          
          // 如果超出了100张，需要清理被移除图片的 IDB 数据
          if (state.imageHistory.length >= 100) {
              const removed = state.imageHistory[99];
              if (removed) {
                  delVal(`image_data_${removed.id}`).catch(console.error);
              }
          }
          
          return { imageHistory: newHistory };
        });
      },

      deleteImageFromHistory: async (id) => {
        // 清理 IDB 数据
        try {
            await delVal(`image_data_${id}`);
        } catch (e) {
            console.error('Failed to delete image data from IDB', e);
        }

        set((state) => ({
          imageHistory: state.imageHistory.filter((img) => img.id !== id),
        }));
      },

      clearImageHistory: async () => {
        const { imageHistory } = get();
        // 清理所有图片的 IDB 数据
        for (const img of imageHistory) {
            try {
                await delVal(`image_data_${img.id}`);
            } catch (e) {
                console.error(`Failed to delete image data ${img.id}`, e);
            }
        }
        set({ imageHistory: [] });
      },

      cleanInvalidHistory: async () => {
        const { imageHistory } = get();
        let hasChanges = false;
        
        const newHistoryPromises = imageHistory.map(async (img) => {
            // Case 1: 已经是新格式 (有缩略图)
            if (img.thumbnailData) {
                 // 如果还有 base64Data，顺手清理并确保 IDB 有数据
                 if (img.base64Data) {
                     try {
                         await setVal(`image_data_${img.id}`, img.base64Data);
                     } catch (e) { console.error(e); }
                     
                     hasChanges = true;
                     return { ...img, base64Data: undefined };
                 }
                 return img;
            }

            // Case 2: 旧格式 (无缩略图，有 base64Data) -> 迁移
            if (!img.thumbnailData && img.base64Data) {
                hasChanges = true;
                try {
                    // 1. 生成缩略图
                    const thumbnail = await createThumbnail(img.base64Data, img.mimeType);
                    // 2. 存入 IDB
                    await setVal(`image_data_${img.id}`, img.base64Data);
                    
                    // 3. 返回新结构
                    return {
                        ...img,
                        thumbnailData: thumbnail,
                        base64Data: undefined
                    } as ImageHistoryItem;
                } catch (e) {
                    console.error(`Failed to migrate image ${img.id}`, e);
                    // 迁移失败，可能数据坏了，返回 null 标记删除
                    return null; 
                }
            }

            // Case 3: 坏数据 (无缩略图，无 base64Data) -> 删除
            hasChanges = true;
            // 尝试清理残留 IDB
            try {
                await delVal(`image_data_${img.id}`);
            } catch (e) {}
            return null;
        });

        const processedHistory = await Promise.all(newHistoryPromises);
        const validHistory = processedHistory.filter((img): img is ImageHistoryItem => img !== null);

        if (hasChanges || validHistory.length !== imageHistory.length) {
            set({ imageHistory: validHistory });
        }
      },

      setLoading: (loading) => set({ isLoading: loading }),
      
      setInputText: (text) => set({ inputText: text }),
      
      toggleSettings: () => set((state) => ({ isSettingsOpen: !state.isSettingsOpen })),

      clearHistory: () => set((state) => ({
        messages: [],
        sessions: state.sessions.map(s =>
          s.id === state.activeSessionId
            ? { ...s, messageCount: 0, updatedAt: Date.now() }
            : s
        ),
      })),

      removeApiKey: () => set({ apiKey: null }),

      deleteMessage: (id) =>
        set((state) => {
          const index = state.messages.findIndex((m) => m.id === id);
          if (index === -1) return {};

          const newMessages = [...state.messages];
          newMessages.splice(index, 1);

          return { messages: newMessages };
        }),

      sliceMessages: (index) =>
        set((state) => ({
          messages: state.messages.slice(0, index + 1),
        })),

      // Session management
      createSession: async () => {
        const { activeSessionId, messages, sessions } = get();
        // Save current session messages to IDB
        if (activeSessionId && messages.length > 0) {
          try {
            await setVal(`session_messages_${activeSessionId}`, JSON.stringify(messages));
          } catch (e) {
            console.error('Failed to save session messages', e);
          }
        }

        const newId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const newSession: Session = {
          id: newId,
          title: '',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messageCount: 0,
          preview: '',
        };

        // Cap at 50 sessions
        let updatedSessions = [newSession, ...sessions];
        if (updatedSessions.length > 50) {
          const removed = updatedSessions.pop()!;
          delVal(`session_messages_${removed.id}`).catch(console.error);
        }

        set({
          sessions: updatedSessions,
          activeSessionId: newId,
          messages: [],
          inputText: '',
        });
      },

      switchSession: async (id) => {
        const { activeSessionId, messages } = get();
        if (id === activeSessionId) return;

        set({ isSwitchingSession: true });

        try {
          // Save current session messages
          if (activeSessionId && messages.length > 0) {
            await setVal(`session_messages_${activeSessionId}`, JSON.stringify(messages));
          }

          // Load target session messages
          let targetMessages: ChatMessage[] = [];
          try {
            const data = await getVal(`session_messages_${id}`);
            if (data) {
              targetMessages = JSON.parse(data as string);
            }
          } catch (e) {
            console.error('Failed to load session messages', e);
          }

          set({
            activeSessionId: id,
            messages: targetMessages,
            inputText: '',
            isSwitchingSession: false,
          });
        } catch (e) {
          console.error('Failed to switch session', e);
          set({ isSwitchingSession: false });
        }
      },

      deleteSession: async (id) => {
        const { sessions, activeSessionId } = get();

        // Clean up IDB
        delVal(`session_messages_${id}`).catch(console.error);

        const remaining = sessions.filter(s => s.id !== id);

        if (id === activeSessionId) {
          if (remaining.length > 0) {
            // Switch to the most recent session
            const target = remaining[0];
            let targetMessages: ChatMessage[] = [];
            try {
              const data = await getVal(`session_messages_${target.id}`);
              if (data) targetMessages = JSON.parse(data as string);
            } catch (e) {
              console.error('Failed to load session messages', e);
            }
            set({
              sessions: remaining,
              activeSessionId: target.id,
              messages: targetMessages,
              inputText: '',
            });
          } else {
            // Create a new empty session
            const newId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
            set({
              sessions: [{ id: newId, title: '', createdAt: Date.now(), updatedAt: Date.now(), messageCount: 0, preview: '' }],
              activeSessionId: newId,
              messages: [],
              inputText: '',
            });
          }
        } else {
          set({ sessions: remaining });
        }
      },

      renameSession: (id, title) =>
        set((state) => ({
          sessions: state.sessions.map(s =>
            s.id === id ? { ...s, title } : s
          ),
        })),

      toggleSessionPanel: () => set((state) => ({ isSessionPanelOpen: !state.isSessionPanelOpen })),
    }),
    {
      name: 'gemini-pro-storage',
      storage: createJSONStorage(() => storage),
      partialize: (state) => ({
        apiKey: state.apiKey,
        settings: state.settings,
        imageHistory: state.imageHistory,
        messages: state.messages,
        sessions: state.sessions,
        activeSessionId: state.activeSessionId,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // Migration: existing messages but no sessions
        if (state.messages.length > 0 && (!state.sessions || state.sessions.length === 0)) {
          const id = `migrated_${Date.now()}`;
          const firstUserMsg = state.messages.find(m => m.role === 'user');
          const textPart = firstUserMsg?.parts.find(p => p.text);
          const title = textPart
            ? textPart.text!.slice(0, 30) + (textPart.text!.length > 30 ? '...' : '')
            : '已有对话';
          useAppStore.setState({
            sessions: [{
              id,
              title,
              createdAt: state.messages[0]?.timestamp || Date.now(),
              updatedAt: state.messages[state.messages.length - 1]?.timestamp || Date.now(),
              messageCount: state.messages.length,
              preview: textPart?.text?.slice(0, 50) || '',
            }],
            activeSessionId: id,
          });
        } else if (!state.sessions || state.sessions.length === 0) {
          // Fresh install: create default empty session
          const id = `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          useAppStore.setState({
            sessions: [{ id, title: '', createdAt: Date.now(), updatedAt: Date.now(), messageCount: 0, preview: '' }],
            activeSessionId: id,
          });
        }
      },
    }
  )
);

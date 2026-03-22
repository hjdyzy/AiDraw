import React, { useState } from 'react';
import { Plus, MessageSquare, Trash2, X, Check } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useUiStore } from '../store/useUiStore';

const formatRelativeTime = (timestamp: number): string => {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  return new Date(timestamp).toLocaleDateString();
};

export const SessionPanel: React.FC = () => {
  const { sessions, activeSessionId, createSession, switchSession, deleteSession, renameSession, toggleSessionPanel, isSwitchingSession } = useAppStore();
  const { showDialog, addToast } = useUiStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const sortedSessions = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);

  const handleCreate = async () => {
    await createSession();
    addToast('已创建新对话', 'success');
    // Close panel on mobile
    if (window.innerWidth < 640) {
      toggleSessionPanel();
    }
  };

  const handleSwitch = async (id: string) => {
    if (id === activeSessionId || isSwitchingSession) return;
    await switchSession(id);
    if (window.innerWidth < 640) {
      toggleSessionPanel();
    }
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    showDialog({
      type: 'confirm',
      title: '删除对话',
      message: '确定要删除这个对话吗？删除后无法恢复。',
      confirmLabel: '删除',
      onConfirm: () => deleteSession(id),
    });
  };

  const handleStartRename = (id: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(id);
    setEditTitle(currentTitle);
  };

  const handleFinishRename = () => {
    if (editingId && editTitle.trim()) {
      renameSession(editingId, editTitle.trim());
    }
    setEditingId(null);
    setEditTitle('');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">对话列表</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCreate}
            className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-blue-600 dark:hover:text-blue-400 transition"
            title="新建对话"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            onClick={toggleSessionPanel}
            className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition sm:hidden"
            title="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Session List */}
      <div className="flex-1 overflow-y-auto">
        {sortedSessions.length === 0 ? (
          <div className="p-4 text-center text-sm text-gray-400 dark:text-gray-500">
            暂无对话
          </div>
        ) : (
          <div className="py-1">
            {sortedSessions.map(session => {
              const isActive = session.id === activeSessionId;
              const isEditing = editingId === session.id;
              const isHovered = hoveredId === session.id;

              return (
                <div
                  key={session.id}
                  onClick={() => handleSwitch(session.id)}
                  onMouseEnter={() => setHoveredId(session.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={`relative flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-500'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-900/50 border-l-2 border-transparent'
                  } ${isSwitchingSession ? 'pointer-events-none opacity-50' : ''}`}
                >
                  <MessageSquare className={`h-4 w-4 mt-0.5 shrink-0 ${
                    isActive ? 'text-blue-500' : 'text-gray-400 dark:text-gray-500'
                  }`} />

                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <input
                          autoFocus
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.currentTarget.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleFinishRename();
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          onBlur={handleFinishRename}
                          className="w-full text-sm bg-white dark:bg-gray-800 border border-blue-500 rounded px-1.5 py-0.5 text-gray-900 dark:text-white focus:outline-none"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <button
                          onClick={(e) => { e.stopPropagation(); handleFinishRename(); }}
                          className="p-0.5 text-blue-500 hover:text-blue-600"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div
                        className={`text-sm font-medium truncate ${
                          isActive ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-gray-100'
                        }`}
                        onDoubleClick={(e) => handleStartRename(session.id, session.title || '新对话', e)}
                      >
                        {session.title || '新对话'}
                      </div>
                    )}

                    <div className="flex items-center gap-2 mt-0.5">
                      {session.preview && (
                        <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[140px]">
                          {session.preview}
                        </span>
                      )}
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">
                        {formatRelativeTime(session.updatedAt)}
                      </span>
                    </div>
                  </div>

                  {/* Delete button on hover */}
                  {(isHovered || isActive) && !isEditing && (
                    <button
                      onClick={(e) => handleDelete(session.id, e)}
                      className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition shrink-0"
                      title="删除对话"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

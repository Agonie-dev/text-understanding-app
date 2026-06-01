'use client';

import { useState, useCallback, useEffect } from 'react';

interface ApiKeyItem {
  id: string;
  name: string;
  baseUrl: string;
  isActive: boolean;
  isDefault: boolean;
}

interface ConfigData {
  daily_summary_limit: number;
  daily_qa_rounds: number;
}

interface AdminDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
}

export default function AdminDrawer({ isOpen, onClose, onLogout }: AdminDrawerProps) {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [config, setConfig] = useState<ConfigData>({ daily_summary_limit: 10, daily_qa_rounds: 20 });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Add key form
  const [newName, setNewName] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newUrl, setNewUrl] = useState('https://api.moonshot.cn/v1');
  const [newDefault, setNewDefault] = useState(false);

  // Password change
  const [newPassword, setNewPassword] = useState('');

  const showMsg = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 3000);
  };

  const fetchData = useCallback(async () => {
    try {
      const [keysRes, configRes] = await Promise.all([
        fetch('/api/admin/keys'),
        fetch('/api/admin/config'),
      ]);
      if (keysRes.ok) {
        const d = await keysRes.json();
        setKeys(d.keys || []);
      }
      if (configRes.ok) {
        const d = await configRes.json();
        setConfig({
          daily_summary_limit: d.daily_summary_limit || 10,
          daily_qa_rounds: d.daily_qa_rounds || 20,
        });
      }
    } catch {
      showMsg('加载数据失败');
    }
  }, []);

  useEffect(() => {
    if (isOpen) fetchData();
  }, [isOpen, fetchData]);

  const handleAddKey = async () => {
    if (!newName.trim() || !newKey.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/admin/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          api_key: newKey.trim(),
          base_url: newUrl.trim(),
          is_default: newDefault,
        }),
      });
      if (res.ok) {
        showMsg('添加成功');
        setNewName('');
        setNewKey('');
        setNewDefault(false);
        fetchData();
      } else {
        const d = await res.json();
        showMsg(d.error || '添加失败');
      }
    } catch {
      showMsg('网络错误');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteKey = async (id: string) => {
    if (!confirm('确定删除这个 Key？')) return;
    try {
      const res = await fetch(`/api/admin/keys/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showMsg('已删除');
        fetchData();
      } else {
        showMsg('删除失败');
      }
    } catch {
      showMsg('网络错误');
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/keys/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_default: true }),
      });
      if (res.ok) {
        showMsg('已设为默认');
        fetchData();
      } else {
        showMsg('设置失败');
      }
    } catch {
      showMsg('网络错误');
    }
  };

  const handleToggleActive = async (id: string, current: boolean) => {
    try {
      const res = await fetch(`/api/admin/keys/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !current }),
      });
      if (res.ok) {
        fetchData();
      }
    } catch {
      showMsg('网络错误');
    }
  };

  const handleSaveConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          daily_summary_limit: config.daily_summary_limit,
          daily_qa_rounds: config.daily_qa_rounds,
        }),
      });
      if (res.ok) {
        showMsg('配置已保存');
      } else {
        showMsg('保存失败');
      }
    } catch {
      showMsg('网络错误');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 4) {
      showMsg('密码至少 4 位');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/admin/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_password: newPassword }),
      });
      if (res.ok) {
        showMsg('密码已修改');
        setNewPassword('');
      } else {
        showMsg('修改失败');
      }
    } catch {
      showMsg('网络错误');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-2xl z-50 overflow-y-auto">
        <div className="p-6 space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">⚙️ 管理后台</h2>
            <div className="flex gap-2">
              <button
                onClick={onLogout}
                className="text-sm text-red-600 hover:text-red-800 font-medium"
              >
                退出
              </button>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">
                ✕
              </button>
            </div>
          </div>

          {message && (
            <div className="p-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
              {message}
            </div>
          )}

          {/* API Keys */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              🔑 API Key 管理
            </h3>

            {/* Key list */}
            <div className="space-y-2 mb-4">
              {keys.map((k) => (
                <div key={k.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-800 truncate">{k.name}</div>
                    <div className="text-xs text-gray-400 truncate">{k.baseUrl}</div>
                  </div>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${k.isDefault ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'}`}>
                    {k.isDefault ? '默认' : ''}
                  </span>
                  <button
                    onClick={() => handleToggleActive(k.id, k.isActive)}
                    className={`text-xs px-2 py-1 rounded ${k.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                  >
                    {k.isActive ? '启用' : '停用'}
                  </button>
                  {!k.isDefault && (
                    <button
                      onClick={() => handleSetDefault(k.id)}
                      className="text-xs px-2 py-1 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100"
                    >
                      设为默认
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteKey(k.id)}
                    className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100"
                  >
                    删除
                  </button>
                </div>
              ))}
              {keys.length === 0 && (
                <div className="text-sm text-gray-400 py-2">暂无 API Key，请添加</div>
              )}
            </div>

            {/* Add form */}
            <div className="space-y-2 p-3 bg-gray-50 rounded-lg">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="名称（如 Kimi 主 Key）"
                className="w-full px-2 py-1.5 border rounded text-sm"
              />
              <input
                type="password"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="API Key"
                className="w-full px-2 py-1.5 border rounded text-sm"
              />
              <input
                type="text"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="Base URL"
                className="w-full px-2 py-1.5 border rounded text-sm"
              />
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={newDefault}
                  onChange={(e) => setNewDefault(e.target.checked)}
                  className="w-4 h-4"
                />
                设为默认
              </label>
              <button
                onClick={handleAddKey}
                disabled={loading || !newName.trim() || !newKey.trim()}
                className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded text-sm font-medium"
              >
                {loading ? '添加中...' : '添加 Key'}
              </button>
            </div>
          </section>

          {/* Quota Config */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">📊 游客配额</h3>
            <div className="space-y-3 p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between">
                <label className="text-sm text-gray-600">每日总结次数</label>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={config.daily_summary_limit}
                  onChange={(e) => setConfig((c) => ({ ...c, daily_summary_limit: parseInt(e.target.value) || 1 }))}
                  className="w-20 px-2 py-1 border rounded text-sm text-right"
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm text-gray-600">每日问答轮数</label>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={config.daily_qa_rounds}
                  onChange={(e) => setConfig((c) => ({ ...c, daily_qa_rounds: parseInt(e.target.value) || 1 }))}
                  className="w-20 px-2 py-1 border rounded text-sm text-right"
                />
              </div>
              <button
                onClick={handleSaveConfig}
                disabled={loading}
                className="w-full py-1.5 bg-gray-800 hover:bg-gray-900 disabled:bg-gray-400 text-white rounded text-sm font-medium"
              >
                保存配额
              </button>
            </div>
          </section>

          {/* Password */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">🔐 修改密码</h3>
            <div className="space-y-2 p-3 bg-gray-50 rounded-lg">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="新密码（至少 4 位）"
                className="w-full px-2 py-1.5 border rounded text-sm"
              />
              <button
                onClick={handleChangePassword}
                disabled={loading || newPassword.length < 4}
                className="w-full py-1.5 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white rounded text-sm font-medium"
              >
                修改密码
              </button>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

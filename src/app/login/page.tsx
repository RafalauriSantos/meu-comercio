'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient, AuthUser } from '@/frontend/lib/api-client';
import { getErrorMessage, parseCurrencyInput } from '@/frontend/lib/formatters';
import '@/frontend/styles/auth.css';

export default function LoginPage() {
  const router = useRouter();

  // Estados de Verificação
  const [loading, setLoading] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [cashOpen, setCashOpen] = useState<boolean | null>(null);

  // Estados de Formulário
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Setup inicial
  const [setupUsername, setSetupUsername] = useState('');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupConfirm, setSetupConfirm] = useState('');
  const [setupPin, setSetupPin] = useState('');

  // Abertura de Caixa
  const [openingBalance, setOpeningBalance] = useState('100.00');

  // Feedback
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    async function checkStatus() {
      try {
        const setup = await apiClient.getSetupStatus();
        if (setup.setupRequired) {
          setSetupRequired(true);
          setLoading(false);
          return;
        }

        // Se o setup já foi concluído, verificar se já está logado
        try {
          const [me, cash] = await Promise.all([
            apiClient.me(),
            apiClient.getCurrentCash().catch(() => ({ open: false, session: null })),
          ]);
          setUser(me);
          setCashOpen(cash.open);
        } catch {
          // Não autenticado
          setUser(null);
        }
      } catch (err) {
        console.error('Erro ao verificar status:', err);
        setError('Não foi possível conectar ao servidor. Verifique sua conexão.');
      } finally {
        setLoading(false);
      }
    }

    checkStatus();
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setProcessing(true);

    try {
      const loggedUser = await apiClient.login({ username, password });
      setUser(loggedUser);

      // Verificar status do caixa
      const cash = await apiClient.getCurrentCash();
      setCashOpen(cash.open);

      if (cash.open) {
        router.push('/');
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao realizar login. Tente novamente.'));
    } finally {
      setProcessing(false);
    }
  }

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (setupPassword !== setupConfirm) {
      setError('A confirmação de senha não confere.');
      return;
    }

    if (setupPin.length < 4 || setupPin.length > 6) {
      setError('O PIN da proprietária deve ter entre 4 e 6 números.');
      return;
    }

    setProcessing(true);
    try {
      const createdUser = await apiClient.setupOwner({
        username: setupUsername,
        password: setupPassword,
        authorizationPin: setupPin,
      });

      setSetupRequired(false);
      setUser(createdUser);

      const cash = await apiClient.getCurrentCash();
      setCashOpen(cash.open);
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao configurar proprietária.'));
    } finally {
      setProcessing(false);
    }
  }

  async function handleOpenCash(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setProcessing(true);

    try {
      await apiClient.openCash({ openingBalance: parseCurrencyInput(openingBalance) });
      setCashOpen(true);
      router.push('/');
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao abrir caixa.'));
    } finally {
      setProcessing(false);
    }
  }

  if (loading) {
    return (
      <main className="auth-wrapper">
        <div className="auth-card" style={{ textAlign: 'center', padding: '48px 32px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
            <div className="auth-loading-spinner" style={{ width: '32px', height: '32px', borderTopColor: '#059669', borderColor: '#d1fae5' }} />
          </div>
          <span className="auth-pill" style={{ margin: '0 auto 8px' }}>Carregando</span>
          <h2 className="auth-title" style={{ fontSize: '18px' }}>Verificando sistema...</h2>
        </div>
      </main>
    );
  }

  // Tela 1: Configuração Inicial da Proprietária
  if (setupRequired) {
    return (
      <main className="auth-wrapper">
        <div className="auth-card">
          <header className="auth-header">
            <div className="auth-header-top">
              <div className="auth-icon-badge">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/>
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                  <path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/>
                  <path d="M2 7h20"/>
                </svg>
              </div>
              <div>
                <span className="auth-pill">Primeiro Acesso</span>
                <h1 className="auth-title">Configurar Loja</h1>
              </div>
            </div>
            <p className="auth-subtitle">
              Cadastre a conta da proprietária para inicializar o comércio e autorizar operações no balcão.
            </p>
          </header>

          {error && (
            <div className="auth-error">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '2px' }}>
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSetup} className="auth-form">
            <div className="auth-field">
              <label className="auth-label" htmlFor="setup-user">Usuário da Proprietária</label>
              <input
                id="setup-user"
                className="auth-input"
                type="text"
                required
                autoFocus
                value={setupUsername}
                onChange={(e) => setSetupUsername(e.target.value)}
                placeholder="Ex: tatiane"
              />
            </div>

            <div className="auth-field">
              <div className="auth-label">
                <label htmlFor="setup-pass">Senha de Acesso</label>
                <span className="auth-label-hint">Mínimo 8 caracteres</span>
              </div>
              <input
                id="setup-pass"
                className="auth-input"
                type="password"
                required
                minLength={8}
                value={setupPassword}
                onChange={(e) => setSetupPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="setup-conf">Confirmar Senha</label>
              <input
                id="setup-conf"
                className="auth-input"
                type="password"
                required
                minLength={8}
                value={setupConfirm}
                onChange={(e) => setSetupConfirm(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            <div className="auth-field">
              <div className="auth-label">
                <label htmlFor="setup-pin">PIN de Autorização</label>
                <span className="auth-label-hint">4 a 6 números</span>
              </div>
              <input
                id="setup-pin"
                className="auth-input mono"
                type="password"
                inputMode="numeric"
                maxLength={6}
                required
                value={setupPin}
                onChange={(e) => setSetupPin(e.target.value)}
                placeholder="••••"
              />
            </div>

            <button className="auth-btn-primary" type="submit" disabled={processing}>
              {processing ? (
                <>
                  <div className="auth-loading-spinner" />
                  <span>Cadastrando...</span>
                </>
              ) : (
                'Finalizar Setup e Entrar'
              )}
            </button>
          </form>
        </div>
      </main>
    );
  }

  // Tela 2: Abertura de Caixa se o usuário já logou e o caixa está fechado
  if (user && cashOpen === false) {
    return (
      <main className="auth-wrapper">
        <div className="auth-card">
          <header className="auth-header">
            <div className="auth-header-top">
              <div className="auth-icon-badge">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="20" height="12" x="2" y="6" rx="2"/>
                  <circle cx="12" cy="12" r="2"/>
                  <path d="M6 12h.01M18 12h.01"/>
                </svg>
              </div>
              <div>
                <span className="auth-pill">Operação de Caixa</span>
                <h1 className="auth-title">Abrir Novo Caixa</h1>
              </div>
            </div>
            <p className="auth-subtitle">
              Olá, <strong>{user.username}</strong>! O caixa está fechado. Informe o valor do fundo de troco para iniciar as vendas.
            </p>
          </header>

          {error && (
            <div className="auth-error">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '2px' }}>
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleOpenCash} className="auth-form">
            <div className="auth-field">
              <label className="auth-label" htmlFor="opening-balance">Fundo de Troco Inicial (R$)</label>
              <input
                id="opening-balance"
                className="auth-input mono"
                style={{ fontSize: '18px', fontWeight: 'bold' }}
                type="number"
                step="0.01"
                min="0"
                required
                autoFocus
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
              />
            </div>

            <button className="auth-btn-primary" type="submit" disabled={processing}>
              {processing ? (
                <>
                  <div className="auth-loading-spinner" />
                  <span>Abrindo caixa...</span>
                </>
              ) : (
                'Confirmar e Ir para o PDV'
              )}
            </button>

            <button
              className="auth-btn-secondary"
              type="button"
              onClick={() => router.push('/gestao')}
            >
              Ir para Painel de Gestão sem abrir caixa
            </button>
          </form>
        </div>
      </main>
    );
  }

  // Tela 3: Login de Operador / Proprietária
  return (
    <main className="auth-wrapper">
      <div className="auth-card">
        <header className="auth-header">
          <div className="auth-header-top">
            <div className="auth-icon-badge">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
            </div>
            <div>
              <span className="auth-pill">Meu Comércio PDV</span>
              <h1 className="auth-title">Entrar no Sistema</h1>
            </div>
          </div>
          <p className="auth-subtitle">
            Identifique-se para acessar o balcão de vendas e o controle financeiro.
          </p>
        </header>

        {error && (
          <div className="auth-error">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '2px' }}>
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="auth-form">
          <div className="auth-field">
            <label className="auth-label" htmlFor="login-username">Operador / Usuário</label>
            <input
              id="login-username"
              className="auth-input"
              type="text"
              required
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Digite seu usuário"
            />
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="login-password">Senha</label>
            <input
              id="login-password"
              className="auth-input"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Digite sua senha"
            />
          </div>

          <button className="auth-btn-primary" type="submit" disabled={processing}>
            {processing ? (
              <>
                <div className="auth-loading-spinner" />
                <span>Entrando...</span>
              </>
            ) : (
              'Entrar no PDV'
            )}
          </button>
        </form>
      </div>
    </main>
  );
}

'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient, AuthUser } from '@/frontend/lib/api-client';
import { getErrorMessage, parseCurrencyInput } from '@/frontend/lib/formatters';
import { parseAuthMode } from '@/frontend/lib/auth-mode';
import { destinationForSession } from '@/frontend/lib/session-destination';
import { displayFont } from '@/frontend/landing/fonts';
import { AuthShell } from '@/frontend/auth/auth-shell';
import { PasswordField } from '@/frontend/auth/password-field';
import { PinField } from '@/frontend/auth/pin-field';
import { FormError } from '@/frontend/auth/form-error';
import '@/frontend/styles/auth.css';

export default function LoginPage() {
  const router = useRouter();

  // Estados de Verificação
  const [loading, setLoading] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [cashOpen, setCashOpen] = useState<boolean | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  // Estados de Formulário - Login
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Estados de Formulário - Registro de Loja
  const [merchantName, setMerchantName] = useState('');
  const [setupUsername, setSetupUsername] = useState('');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupConfirm, setSetupConfirm] = useState('');
  const [setupPin, setSetupPin] = useState('');

  // Abertura de Caixa
  const [openingBalance, setOpeningBalance] = useState('100.00');

  // Feedback
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [honeypot, setHoneypot] = useState('');

  useEffect(() => {
    async function checkStatus() {
      try {
        const setup = await apiClient.getSetupStatus();
        if (setup.setupRequired) {
          setSetupRequired(true);
          setAuthMode('register');
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
          // An operator who is already working goes straight to the PDV, as the old root route did.
          if (destinationForSession({ cashOpen: cash.open }) === 'pdv') {
            router.replace('/pdv');
            return;
          }
        } catch {
          // Not authenticated: the landing link (?modo=cadastro) opens the sign up form
          setUser(null);
          setAuthMode(parseAuthMode(window.location.search));
        }
      } catch (err) {
        console.error('Erro ao verificar status:', err);
        setError('Não foi possível conectar ao servidor. Verifique sua conexão.');
      } finally {
        setLoading(false);
      }
    }

    checkStatus();
  }, [router]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (honeypot) {
      return;
    }
    setError('');
    setProcessing(true);

    try {
      const loggedUser = await apiClient.login({ username, password });
      setUser(loggedUser);

      // Verificar status do caixa
      const cash = await apiClient.getCurrentCash();
      setCashOpen(cash.open);

      if (cash.open) {
        router.push('/pdv');
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao realizar login. Tente novamente.'));
    } finally {
      setProcessing(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (honeypot) {
      return;
    }
    setError('');

    if (setupPassword !== setupConfirm) {
      setError('A confirmação de senha não confere.');
      return;
    }

    if (!/^\d{6}$/.test(setupPin)) {
      setError('O PIN da proprietária deve ter exatamente 6 números.');
      return;
    }

    setProcessing(true);
    try {
      const createdUser = await apiClient.registerMerchant({
        merchantName: merchantName.trim() || 'Meu Comércio',
        username: setupUsername,
        password: setupPassword,
        authorizationPin: setupPin,
      });

      setSetupRequired(false);
      setUser(createdUser);

      const cash = await apiClient.getCurrentCash();
      setCashOpen(cash.open);
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao cadastrar comércio. Tente novamente.'));
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
      router.push('/pdv');
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao abrir caixa.'));
    } finally {
      setProcessing(false);
    }
  }

  const confirmMismatch = setupConfirm.length > 0 && setupPassword !== setupConfirm;

  if (loading) {
    return (
      <AuthShell mode="login" fontClassName={displayFont.variable}>
        <div className="auth-loading" role="status">
          <div className="auth-loading-spinner" />
          <span>Verificando o sistema…</span>
        </div>
      </AuthShell>
    );
  }

  // Cash register screen: the operator is logged in and the cash register is closed
  if (user && cashOpen === false) {
    return (
      <AuthShell mode="cash" fontClassName={displayFont.variable}>
        <header className="auth-header">
          <h1 className="auth-title">Abrir o caixa</h1>
          <p className="auth-subtitle">
            Olá, <strong>{user.username}</strong>. O caixa está fechado. Informe o fundo de troco para começar a vender.
          </p>
        </header>

        {error && <FormError message={error} />}

        <form onSubmit={handleOpenCash} className="auth-form">
          <div className="auth-field">
            <label className="auth-label" htmlFor="opening-balance">
              Fundo de troco (R$)
            </label>
            <input
              id="opening-balance"
              className="auth-input auth-input-amount"
              type="number"
              inputMode="decimal"
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
                <span>Abrindo o caixa…</span>
              </>
            ) : (
              'Abrir caixa e ir para o PDV'
            )}
          </button>

          <button className="auth-btn-secondary" type="button" onClick={() => router.push('/gestao')}>
            Ir para a gestão sem abrir o caixa
          </button>
        </form>
      </AuthShell>
    );
  }

  // Main screen: sign in or create an account
  return (
    <AuthShell mode={setupRequired ? 'setup' : authMode} fontClassName={displayFont.variable}>
      {!setupRequired && (
        <div className="auth-tabs" role="group" aria-label="Escolha como continuar">
          <button
            type="button"
            className={`auth-tab ${authMode === 'login' ? 'active' : ''}`}
            aria-pressed={authMode === 'login'}
            onClick={() => { setAuthMode('login'); setError(''); }}
          >
            Entrar
          </button>
          <button
            type="button"
            className={`auth-tab ${authMode === 'register' ? 'active' : ''}`}
            aria-pressed={authMode === 'register'}
            onClick={() => { setAuthMode('register'); setError(''); }}
          >
            Criar conta
          </button>
        </div>
      )}

      {authMode === 'login' ? (
        <>
          <header className="auth-header">
            <h1 className="auth-title">Entrar</h1>
            <p className="auth-subtitle">Acesse o caixa da sua loja.</p>
          </header>

          {error && <FormError message={error} />}

          <form onSubmit={handleLogin} className="auth-form">
            <div style={{ display: 'none', position: 'absolute', left: '-9999px' }} aria-hidden="true">
              <label htmlFor="login-website">Website</label>
              <input
                id="login-website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
              />
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="login-username">
                Usuário
              </label>
              <input
                id="login-username"
                className="auth-input"
                type="text"
                required
                autoFocus
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <PasswordField
              id="login-password"
              label="Senha"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
            />

            <button className="auth-btn-primary" type="submit" disabled={processing}>
              {processing ? (
                <>
                  <div className="auth-loading-spinner" />
                  <span>Entrando…</span>
                </>
              ) : (
                'Entrar'
              )}
            </button>
          </form>
        </>
      ) : (
        <>
          <header className="auth-header">
            <h1 className="auth-title">{setupRequired ? 'Configure sua loja' : 'Crie sua conta'}</h1>
            <p className="auth-subtitle">
              {setupRequired
                ? 'Este é o primeiro acesso. Crie a conta da dona para começar.'
                : 'Cadastre sua loja e a conta da dona. Gratuito por enquanto.'}
            </p>
          </header>

          {error && <FormError message={error} />}

          <form onSubmit={handleRegister} className="auth-form">
            <div style={{ display: 'none', position: 'absolute', left: '-9999px' }} aria-hidden="true">
              <label htmlFor="setup-website">Website</label>
              <input
                id="setup-website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
              />
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="setup-merchant">
                Nome da loja
              </label>
              <input
                id="setup-merchant"
                className="auth-input"
                type="text"
                required
                autoFocus
                autoComplete="organization"
                value={merchantName}
                onChange={(e) => setMerchantName(e.target.value)}
                placeholder="Ex.: Mercadinho da Maria"
              />
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="setup-user">
                Seu usuário
              </label>
              <input
                id="setup-user"
                className="auth-input"
                type="text"
                required
                autoComplete="username"
                value={setupUsername}
                onChange={(e) => setSetupUsername(e.target.value)}
                placeholder="Ex.: maria"
              />
            </div>

            <PasswordField
              id="setup-password"
              label="Senha"
              value={setupPassword}
              onChange={setSetupPassword}
              autoComplete="new-password"
              minLength={8}
              placeholder="Mínimo de 8 caracteres"
            />

            <div>
              <PasswordField
                id="setup-confirm"
                label="Repita a senha"
                value={setupConfirm}
                onChange={setSetupConfirm}
                autoComplete="new-password"
                minLength={8}
                invalid={confirmMismatch}
                describedBy={confirmMismatch ? 'setup-confirm-msg' : undefined}
              />
              {confirmMismatch && (
                <p className="auth-field-error" id="setup-confirm-msg">
                  As senhas não conferem.
                </p>
              )}
            </div>

            <PinField
              id="setup-pin"
              label="PIN da dona (6 dígitos)"
              hint="Libera o que é arriscado: fiado acima do limite e estornos."
              value={setupPin}
              onChange={setSetupPin}
            />

            <button className="auth-btn-primary" type="submit" disabled={processing}>
              {processing ? (
                <>
                  <div className="auth-loading-spinner" />
                  <span>Criando conta…</span>
                </>
              ) : (
                'Criar conta e entrar'
              )}
            </button>
          </form>
        </>
      )}
    </AuthShell>
  );
}

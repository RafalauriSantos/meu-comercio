'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient, ApiError, AuthUser } from '@/frontend/lib/api-client';
import { getErrorMessage, parseCurrencyInput } from '@/frontend/lib/formatters';
import { parseAuthMode } from '@/frontend/lib/auth-mode';
import { destinationForSession } from '@/frontend/lib/session-destination';
import { AuthShell } from '@/frontend/auth/auth-shell';
import { CashOpenScreen } from '@/frontend/auth/cash-open-screen';
import { PasswordField } from '@/frontend/auth/password-field';
import { PinField } from '@/frontend/auth/pin-field';
import { passwordsMismatch } from '@/frontend/auth/passwords-mismatch';
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
        // A rate limit answer is not a connection failure: say what happened.
        setError(
          err instanceof ApiError && err.status === 429
            ? err.message
            : 'Não foi possível conectar ao servidor. Verifique sua conexão.'
        );
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

  const confirmMismatch = passwordsMismatch(setupPassword, setupConfirm);

  function switchMode(mode: 'login' | 'register') {
    setAuthMode(mode);
    setError('');
  }

  if (loading) {
    return (
      <AuthShell>
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
      <CashOpenScreen
        username={user.username}
        openingBalance={openingBalance}
        onOpeningBalanceChange={setOpeningBalance}
        onSubmit={handleOpenCash}
        onBack={() => router.push('/gestao')}
        processing={processing}
        error={error}
        now={new Date()}
      />
    );
  }

  // Main screen: sign in or create an account. With setupRequired only the sign up form exists.
  const footer = setupRequired ? undefined : authMode === 'login' ? (
    <>
      Ainda não tem conta?{' '}
      <button type="button" className="auth-link" onClick={() => switchMode('register')}>
        Criar conta grátis
      </button>
    </>
  ) : (
    <>
      Já tem conta?{' '}
      <button type="button" className="auth-link" onClick={() => switchMode('login')}>
        Entrar
      </button>
    </>
  );

  return authMode === 'login' ? (
    <AuthShell labelledBy="auth-title" footer={footer}>
      <header key="login-header" className="auth-header">
        <h1 className="auth-title" id="auth-title">
          Entrar
        </h1>
        <p className="auth-subtitle">Acesse o caixa da sua loja.</p>
      </header>

      {error && <FormError message={error} />}

      <form key="login-form" onSubmit={handleLogin} className="auth-form">
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

        <div>
          <label className="field-label" htmlFor="login-username">
            Usuário
          </label>
          <input
            id="login-username"
            className="input"
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

        <button className="primary auth-submit" type="submit" disabled={processing}>
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
    </AuthShell>
  ) : (
    <AuthShell wide labelledBy="auth-title" footer={footer}>
      <header key="register-header" className="auth-header">
        <h1 className="auth-title" id="auth-title">
          {setupRequired ? 'Configure sua loja' : 'Crie sua conta'}
        </h1>
        <p className="auth-subtitle">
          {setupRequired
            ? 'Este é o primeiro acesso. Crie a conta da dona para começar.'
            : 'Cadastre sua loja e a conta da dona. Gratuito por enquanto.'}
        </p>
      </header>

      {error && <FormError message={error} />}

      <form key="register-form" onSubmit={handleRegister} className="auth-form">
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

        <div className="auth-grid-2">
          <div>
            <label className="field-label" htmlFor="setup-merchant">
              Nome da loja
            </label>
            <input
              id="setup-merchant"
              className="input"
              type="text"
              required
              autoFocus
              autoComplete="organization"
              value={merchantName}
              onChange={(e) => setMerchantName(e.target.value)}
              placeholder="Ex.: Mercadinho da Maria"
            />
          </div>

          <div>
            <label className="field-label" htmlFor="setup-user">
              Seu usuário
            </label>
            <input
              id="setup-user"
              className="input"
              type="text"
              required
              autoComplete="username"
              value={setupUsername}
              onChange={(e) => setSetupUsername(e.target.value)}
              placeholder="Ex.: maria"
            />
          </div>
        </div>

        <div className="auth-grid-2">
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
        </div>

        <PinField
          id="setup-pin"
          label="PIN da dona (6 dígitos)"
          hint="Libera o que é arriscado: fiado acima do limite e estornos."
          value={setupPin}
          onChange={setSetupPin}
        />

        <button className="primary auth-submit" type="submit" disabled={processing}>
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
    </AuthShell>
  );
}

'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient, AuthUser } from '@/frontend/lib/api-client';
import { getErrorMessage, parseCurrencyInput } from '@/frontend/lib/formatters';
import '@/frontend/styles/pdv.css';

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
          const me = await apiClient.me();
          setUser(me);
          // Verificar status do caixa
          const cash = await apiClient.getCurrentCash();
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
      <main className="pdv-page" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="card" style={{ padding: '32px', textAlign: 'center' }}>
          <p className="eyebrow">Carregando</p>
          <h2>Verificando sistema...</h2>
        </div>
      </main>
    );
  }

  // Tela 1: Configuração Inicial da Proprietária
  if (setupRequired) {
    return (
      <main className="pdv-page" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="card" style={{ maxWidth: '440px', width: '100%', padding: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <span className="brand-mark">b</span>
            <div>
              <span className="eyebrow">Primeiro Acesso</span>
              <h1>Configurar Loja</h1>
            </div>
          </div>
          <p className="muted" style={{ marginBottom: '18px' }}>
            Cadastre a conta da proprietária para inicializar o comércio e autorizar operações no balcão.
          </p>

          {error && <div className="error">{error}</div>}

          <form onSubmit={handleSetup} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label className="eyebrow" htmlFor="setup-user">Usuário da Proprietária</label>
              <input
                id="setup-user"
                className="barcode-row"
                style={{ width: '100%' }}
                type="text"
                required
                value={setupUsername}
                onChange={(e) => setSetupUsername(e.target.value)}
                placeholder="Ex: tatiane"
              />
            </div>
            <div>
              <label className="eyebrow" htmlFor="setup-pass">Senha de Acesso</label>
              <input
                id="setup-pass"
                className="barcode-row"
                style={{ width: '100%' }}
                type="password"
                required
                minLength={8}
                value={setupPassword}
                onChange={(e) => setSetupPassword(e.target.value)}
              />
            </div>
            <div>
              <label className="eyebrow" htmlFor="setup-conf">Confirmar Senha</label>
              <input
                id="setup-conf"
                className="barcode-row"
                style={{ width: '100%' }}
                type="password"
                required
                minLength={8}
                value={setupConfirm}
                onChange={(e) => setSetupConfirm(e.target.value)}
              />
            </div>
            <div>
              <label className="eyebrow" htmlFor="setup-pin">PIN de Autorização (4 a 6 dígitos)</label>
              <input
                id="setup-pin"
                className="barcode-row mono"
                style={{ width: '100%' }}
                type="password"
                inputMode="numeric"
                maxLength={6}
                required
                value={setupPin}
                onChange={(e) => setSetupPin(e.target.value)}
                placeholder="Ex: 1234"
              />
            </div>
            <button className="primary wide" type="submit" disabled={processing} style={{ marginTop: '12px' }}>
              {processing ? 'Cadastrando...' : 'Finalizar Setup e Entrar'}
            </button>
          </form>
        </div>
      </main>
    );
  }

  // Tela 2: Abertura de Caixa se o usuário já logou e o caixa está fechado
  if (user && cashOpen === false) {
    return (
      <main className="pdv-page" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="card" style={{ maxWidth: '440px', width: '100%', padding: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <span className="brand-mark">b</span>
            <div>
              <span className="eyebrow">Operação de Caixa</span>
              <h1>Abrir Novo Caixa</h1>
            </div>
          </div>
          <p className="muted" style={{ marginBottom: '16px' }}>
            Olá, <strong>{user.username}</strong>! O caixa está fechado. Informe o fundo de troco inicial para começar a registrar vendas no balcão.
          </p>

          {error && <div className="error">{error}</div>}

          <form onSubmit={handleOpenCash} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label className="eyebrow" htmlFor="opening-balance">Fundo de Troco Inicial (R$)</label>
              <input
                id="opening-balance"
                className="barcode-row mono"
                style={{ width: '100%', fontSize: '20px', fontWeight: 'bold' }}
                type="number"
                step="0.01"
                min="0"
                required
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
              />
            </div>

            <button className="primary wide" type="submit" disabled={processing}>
              {processing ? 'Abrindo caixa...' : 'Confirmar e Ir para o PDV'}
            </button>

            <button
              className="ghost"
              type="button"
              onClick={() => router.push('/gestao')}
              style={{ marginTop: '4px' }}
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
    <main className="pdv-page" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" style={{ maxWidth: '420px', width: '100%', padding: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <span className="brand-mark">b</span>
          <div>
            <span className="eyebrow">Meu Comércio PDV</span>
            <h1>Entrar no Sistema</h1>
          </div>
        </div>
        <p className="muted" style={{ marginBottom: '18px' }}>
          Identifique-se para acessar o balcão de vendas e o controle financeiro.
        </p>

        {error && <div className="error">{error}</div>}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label className="eyebrow" htmlFor="login-username">Operador / Usuário</label>
            <input
              id="login-username"
              className="barcode-row"
              style={{ width: '100%' }}
              type="text"
              required
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Digite seu usuário"
            />
          </div>
          <div>
            <label className="eyebrow" htmlFor="login-password">Senha</label>
            <input
              id="login-password"
              className="barcode-row"
              style={{ width: '100%' }}
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Digite sua senha"
            />
          </div>

          <button className="primary wide" type="submit" disabled={processing} style={{ marginTop: '10px' }}>
            {processing ? 'Entrando...' : 'Entrar no PDV'}
          </button>
        </form>
      </div>
    </main>
  );
}

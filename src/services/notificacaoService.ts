import sgMail from '@sendgrid/mail';
import { logger } from '../config/logger';
import prisma from '../config/database';
import { CanalNotificacao, StatusNotificacao } from '@prisma/client';

// Configurar SendGrid
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || '';
const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'noreply@seurestaurante.com.br';
const SENDGRID_FROM_NAME = process.env.SENDGRID_FROM_NAME || 'Sistema de Filas';

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
  logger.info('SendGrid configurado');
} else {
  logger.warn('SENDGRID_API_KEY não configurada - emails não serão enviados');
}

export type BoasVindasPayload = {
  clienteId: string;
  restauranteId: string;
  nomeCompleto: string;
  email: string;
  telefone?: string;
  cidade?: string;
  estado?: string;
};

export type ChamadoPayload = {
  ticketId: string;
  clienteId?: string;
  nomeCliente: string;
  emailCliente?: string;
  numeroTicket: string;
  nomeRestaurante: string;
  restauranteId: string;
  prioridade: string;
  valorPrioridade: number;
  enderecoRestaurante?: string;
};

const substituirVariaveis = (template: string, variaveis: Record<string, any>): string => {
  let resultado = template;
  
  // Substituir variáveis simples {{variavel}}
  Object.entries(variaveis).forEach(([chave, valor]) => {
    const regex = new RegExp(`{{${chave}}}`, 'g');
    resultado = resultado.replace(regex, String(valor || ''));
  });
  
  // Remover blocos condicionais vazios {{#variavel}}...{{/variavel}}
  Object.entries(variaveis).forEach(([chave, valor]) => {
    if (!valor || valor === '') {
      // Remover bloco inteiro se variável vazia
      const regexBloco = new RegExp(`{{#${chave}}}[\\s\\S]*?{{\\/${chave}}}`, 'g');
      resultado = resultado.replace(regexBloco, '');
    } else {
      // Remover apenas as tags condicionais, manter conteúdo
      const regexInicio = new RegExp(`{{#${chave}}}`, 'g');
      const regexFim = new RegExp(`{{\\/${chave}}}`, 'g');
      resultado = resultado.replace(regexInicio, '');
      resultado = resultado.replace(regexFim, '');
    }
  });
  
  return resultado;
};

    
const TEMPLATE_BOAS_VINDAS_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center; color: white; }
    .header h1 { margin: 0; font-size: 28px; }
    .content { padding: 30px 20px; }
    .info-box { background: #f8f9fa; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0; border-radius: 4px; }
    .info-box strong { color: #667eea; }
    .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #666; }
    .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 Bem-vindo(a)!</h1>
    </div>
    <div class="content">
      <h2>Olá, {{nomeCompleto}}!</h2>
      <p>É um prazer ter você conosco! Sua conta foi criada com sucesso e agora você pode aproveitar todos os benefícios do nosso sistema de filas inteligente.</p>
      
      <div class="info-box">
        <strong>📧 Email:</strong> {{email}}<br>
        {{#telefone}}<strong>📱 Telefone:</strong> {{telefone}}<br>{{/telefone}}
        {{#cidade}}<strong>📍 Localização:</strong> {{cidade}}, {{estado}}{{/cidade}}
      </div>
      
      <h3>✨ O que você pode fazer agora:</h3>
      <ul>
        <li>🔍 Buscar restaurantes próximos</li>
        <li>🎫 Entrar em filas remotamente</li>
        <li>⏱️ Acompanhar sua posição em tempo real</li>
        <li>🚀 Usar prioridades Fast Lane e VIP</li>
      </ul>
      
      <p style="text-align: center;">
        <a href="{{appLink}}" class="button">Abrir App</a>
      </p>
    </div>
    <div class="footer">
      <p>Este é um email automático, por favor não responda.<br>
      © 2025 Sistema de Filas. Todos os direitos reservados.</p>
    </div>
  </div>
</body>
</html>
`;

const TEMPLATE_CHAMADO_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 50px 20px; text-align: center; color: white; }
    .header h1 { margin: 0; font-size: 36px; animation: pulse 1.5s infinite; }
    @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
    .content { padding: 30px 20px; }
    .ticket-box { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; margin: 20px 0; border-radius: 8px; text-align: center; }
    .ticket-box .numero { font-size: 48px; font-weight: bold; margin: 10px 0; }
    .alert-box { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px; }
    .info-box { background: #f8f9fa; padding: 15px; margin: 20px 0; border-radius: 4px; }
    .info-box strong { color: #667eea; }
    .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #666; }
    .urgente { background: #dc3545; color: white; padding: 15px; text-align: center; font-weight: bold; font-size: 18px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="urgente">
      🔴 ATENÇÃO: É SUA VEZ!
    </div>
    <div class="header">
      <h1>🎯 VOCÊ FOI CHAMADO!</h1>
    </div>
    <div class="content">
      <h2>Olá, {{nomeCliente}}!</h2>
      <p style="font-size: 18px; color: #dc3545; font-weight: bold;">
        É a sua vez! Por favor, compareça ao balcão AGORA.
      </p>
      
      <div class="ticket-box">
        <div>SEU TICKET</div>
        <div class="numero">{{numeroTicket}}</div>
        <div>Prioridade: {{prioridade}}</div>
      </div>
      
      {{#taxaInfo}}
      <div class="alert-box">
        <strong>💰 Taxa de Prioridade:</strong> {{taxaInfo}}
      </div>
      {{/taxaInfo}}
      
      <div class="info-box">
        <strong>🏪 Restaurante:</strong> {{nomeRestaurante}}<br>
        {{#enderecoRestaurante}}<strong>📍 Endereço:</strong> {{enderecoRestaurante}}<br>{{/enderecoRestaurante}}
        <strong>⏰ Horário da Chamada:</strong> {{horarioChamada}}
      </div>
      
      <div style="background: #e3f2fd; padding: 15px; border-radius: 4px; margin: 20px 0;">
        <strong>⚠️ Importante:</strong>
        <ul style="margin: 10px 0; padding-left: 20px;">
          <li>Dirija-se imediatamente ao balcão</li>
          <li>Apresente este email ou seu número de ticket</li>
          <li>Caso não compareça, seu ticket poderá ser cancelado</li>
        </ul>
      </div>
    </div>
    <div class="footer">
      <p>Este é um email automático, por favor não responda.<br>
      © 2025 Sistema de Filas. Todos os direitos reservados.</p>
    </div>
  </div>
</body>
</html>
`;

// MÉTODO: ENVIAR BOAS-VINDAS
export const enviarBoasVindas = async (dados: BoasVindasPayload): Promise<void> => {
  const { clienteId, restauranteId, nomeCompleto, email, telefone, cidade, estado } = dados;

  try {
    logger.info({ clienteId, restauranteId, email }, 'Iniciando envio de email de boas-vindas');

    // Usar template HTML padrão (sem buscar do banco por enquanto)
    let templateHtml = TEMPLATE_BOAS_VINDAS_HTML;

    // Substituir variáveis
    const variaveis = {
      nomeCompleto,
      email,
      telefone: telefone || '',
      cidade: cidade || '',
      estado: estado || '',
      appLink: process.env.FRONTEND_URL || 'https://app.exemplo.com.br'
    };

    const htmlFinal = substituirVariaveis(templateHtml, variaveis);

    // Enviar email via SendGrid (apenas se API key configurada)
    let statusNotificacao: StatusNotificacao = StatusNotificacao.ENVIADO;
    let metadados: any = { tentativas: 1 };
    let enviadoEm: Date | undefined = undefined;
    let falhouEm: Date | undefined = undefined;

    if (SENDGRID_API_KEY) {
      try {
        await sgMail.send({
          to: email,
          from: {
            email: SENDGRID_FROM_EMAIL,
            name: SENDGRID_FROM_NAME
          },
          subject: `🎉 Bem-vindo(a) ao Sistema de Filas, ${nomeCompleto}!`,
          html: htmlFinal
        });

        enviadoEm = new Date();
        logger.info({ clienteId, email }, '✅ Email de boas-vindas enviado com sucesso');
      } catch (error: any) {
        statusNotificacao = StatusNotificacao.FALHOU;
        falhouEm = new Date();
        metadados = {
          tentativas: 1,
          erro: error.message,
          codigo: error.code
        };
        logger.error({ clienteId, email, error }, '❌ Falha ao enviar email de boas-vindas');
      }
    } else {
      statusNotificacao = StatusNotificacao.PENDENTE;
      metadados = { motivo: 'SENDGRID_API_KEY não configurada' };
      logger.warn({ clienteId }, '⚠️  Email não enviado - SendGrid não configurado');
    }

    logger.info({ clienteId, status: statusNotificacao }, 'Notificação de boas-vindas processada');
  } catch (error) {
    logger.error({ clienteId, restauranteId, error }, 'Erro crítico ao processar boas-vindas');
    // Não propagar erro para não bloquear cadastro
  }
};

// MÉTODO: ENVIAR CHAMADO
export const enviarChamado = async (dados: ChamadoPayload): Promise<void> => {
  const {
    ticketId,
    clienteId,
    nomeCliente,
    emailCliente,
    numeroTicket,
    nomeRestaurante,
    restauranteId,
    prioridade,
    valorPrioridade,
    enderecoRestaurante
  } = dados;

  if (!emailCliente) {
    logger.warn({ ticketId }, 'Email do cliente não informado - notificação ignorada');
    return;
  }

  try {
    logger.info({ ticketId, emailCliente }, 'Iniciando envio de email de chamado');

    // Usar template HTML padrão
    let templateHtml = TEMPLATE_CHAMADO_HTML;

    // Preparar informação de taxa
    let taxaInfo = '';
    if (valorPrioridade > 0) {
      taxaInfo = `R$ ${valorPrioridade.toFixed(2)} (${prioridade})`;
    }

    // Substituir variáveis
    const variaveis = {
      nomeCliente,
      numeroTicket,
      nomeRestaurante,
      prioridade,
      valorPrioridade: valorPrioridade > 0 ? `R$ ${valorPrioridade.toFixed(2)}` : 'Gratuito',
      taxaInfo,
      enderecoRestaurante: enderecoRestaurante || 'Consulte o app',
      horarioChamada: new Date().toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short'
      })
    };

    const htmlFinal = substituirVariaveis(templateHtml, variaveis);

    // Enviar email via SendGrid
    let statusNotificacao: StatusNotificacao = StatusNotificacao.ENVIADO;
    let metadados: any = { tentativas: 1, ticketId };
    let enviadoEm: Date | undefined = undefined;
    let falhouEm: Date | undefined = undefined;

    if (SENDGRID_API_KEY) {
      try {
        await sgMail.send({
          to: emailCliente,
          from: {
            email: SENDGRID_FROM_EMAIL,
            name: SENDGRID_FROM_NAME
          },
          subject: `🔴 É SUA VEZ! Ticket ${numeroTicket} - ${nomeRestaurante}`,
          html: htmlFinal
        });

        enviadoEm = new Date();
        logger.info({ ticketId, emailCliente }, '✅ Email de chamado enviado com sucesso');
      } catch (error: any) {
        statusNotificacao = StatusNotificacao.FALHOU;
        falhouEm = new Date();
        metadados = {
          tentativas: 1,
          ticketId,
          erro: error.message,
          codigo: error.code
        };
        logger.error({ ticketId, emailCliente, error }, '❌ Falha ao enviar email de chamado');
      }
    } else {
      statusNotificacao = StatusNotificacao.PENDENTE;
      metadados = { ticketId, motivo: 'SENDGRID_API_KEY não configurada' };
      logger.warn({ ticketId }, '⚠️  Email não enviado - SendGrid não configurado');
    }

    logger.info({ ticketId, status: statusNotificacao }, 'Notificação de chamado processada');
  } catch (error) {
    logger.error({ ticketId, restauranteId, error }, 'Erro crítico ao processar chamado');
    // Não propagar erro para não bloquear fluxo principal
  }
};

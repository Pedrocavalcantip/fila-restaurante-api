import { Server } from 'socket.io';
import io from 'socket.io-client';
import { createServer } from 'http';
import app from '../src/app';
import prisma from '../src/config/database';
import {
  criarDadosTesteCliente,
  limparDadosTesteCliente,
  limparTicketsTesteCliente,
  clienteTestIds,
} from './helpers/clienteTestDatabase';
import * as authClienteService from '../src/services/authClienteService';

type ClientSocket = ReturnType<typeof io>;

describe('Sprint 2 - WebSocket do Cliente (Tópico 6)', () => {
  let httpServer: any;
  let ioServer: Server;
  let clientSocket: ClientSocket;
  let clienteToken: string;
  let ticketId: string;
  const PORT = 3002; // Porta de teste diferente

  beforeAll(async () => {
    await prisma.$connect();
    await limparDadosTesteCliente();
    await criarDadosTesteCliente();

    // Criar servidor HTTP e Socket.IO para testes
    httpServer = createServer(app);
    ioServer = new Server(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });

    // Configurar eventos do socket (simulando server.ts)
    ioServer.on('connection', (socket) => {
      socket.on('entrar-ticket', async (dados: { ticketId: string; clienteId?: string }) => {
        const { ticketId, clienteId } = dados;
        
        if (!ticketId) {
          socket.emit('erro', { 
            mensagem: 'ticketId é obrigatório',
            codigo: 'DADOS_INVALIDOS' 
          });
          return;
        }

        // Validar ticket
        const ticket = await prisma.ticket.findUnique({
          where: { id: ticketId },
          select: { id: true, status: true, clienteId: true },
        });

        if (!ticket) {
          socket.emit('erro', { 
            mensagem: 'Ticket não encontrado',
            codigo: 'TICKET_NAO_ENCONTRADO'
          });
          return;
        }

        // Cliente só pode ouvir seu próprio ticket
        if (clienteId && ticket.clienteId !== clienteId) {
          socket.emit('erro', { 
            mensagem: 'Você não tem permissão para ouvir este ticket',
            codigo: 'NAO_AUTORIZADO'
          });
          return;
        }

        socket.join(`ticket:${ticketId}`);
        socket.emit('ticket:entrou', {
          ticketId,
          timestamp: new Date().toISOString(),
        });
      });

      socket.on('sair-ticket', (ticketId: string) => {
        if (ticketId) {
          socket.leave(`ticket:${ticketId}`);
          socket.emit('ticket:saiu', { 
            ticketId,
            timestamp: new Date().toISOString()
          });
        }
      });
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(PORT, () => {
        console.log(`Servidor de teste rodando na porta ${PORT}`);
        resolve();
      });
    });

    // Fazer login como cliente para obter token
    const loginPayload = {
      restauranteSlug: 'restaurante-sp-centro',
      email: 'cliente1@teste.com',
      senha: 'senha123',
    };

    const resultado = await authClienteService.loginCliente(loginPayload);
    clienteToken = resultado.token;
  });

  afterAll(async () => {
    await limparDadosTesteCliente();
    if (clientSocket) {
      clientSocket.close();
    }
    if (ioServer) {
      ioServer.close();
    }
    if (httpServer) {
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });
    }
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await limparTicketsTesteCliente();

    // Criar um ticket para testes
    const ticket = await prisma.ticket.create({
      data: {
        restauranteId: clienteTestIds.restaurante1,
        filaId: clienteTestIds.fila1,
        clienteId: clienteTestIds.cliente1,
        nomeCliente: 'Cliente Teste WebSocket',
        numeroTicket: 'A-001',
        status: 'AGUARDANDO',
        prioridade: 'NORMAL',
        tipoEntrada: 'REMOTO',
      },
    });
    ticketId = ticket.id;
  });

  afterEach(() => {
    if (clientSocket && clientSocket.connected) {
      clientSocket.close();
    }
  });

  describe('1. Conexão do Cliente ao Ticket', () => {
    it('deve conectar ao servidor WebSocket', (done) => {
      clientSocket = io(`http://localhost:${PORT}`);

      clientSocket.on('connect', () => {
        expect(clientSocket.connected).toBe(true);
        done();
      });

      clientSocket.on('connect_error', (error: Error) => {
        done(error);
      });
    });

    it('deve entrar na sala do ticket com sucesso', (done) => {
      clientSocket = io(`http://localhost:${PORT}`);

      clientSocket.on('connect', () => {
        clientSocket.emit('entrar-ticket', { 
          ticketId,
          clienteId: clienteTestIds.cliente1
        });
      });

      clientSocket.on('ticket:entrou', (dados: any) => {
        expect(dados.ticketId).toBe(ticketId);
        expect(dados).toHaveProperty('timestamp');
        done();
      });
    });

    it('deve rejeitar entrada sem ticketId', (done) => {
      clientSocket = io(`http://localhost:${PORT}`);

      clientSocket.on('connect', () => {
        clientSocket.emit('entrar-ticket', { 
          clienteId: clienteTestIds.cliente1
        });
      });

      clientSocket.on('erro', (erro: any) => {
        expect(erro.mensagem).toContain('ticketId é obrigatório');
        expect(erro.codigo).toBe('DADOS_INVALIDOS');
        done();
      });
    });

    it('deve rejeitar ticket inexistente', (done) => {
      clientSocket = io(`http://localhost:${PORT}`);

      clientSocket.on('connect', () => {
        clientSocket.emit('entrar-ticket', { 
          ticketId: '99999999-9999-9999-9999-999999999999',
          clienteId: clienteTestIds.cliente1
        });
      });

      clientSocket.on('erro', (erro: any) => {
        expect(erro.mensagem).toContain('Ticket não encontrado');
        expect(erro.codigo).toBe('TICKET_NAO_ENCONTRADO');
        done();
      });
    });

    it('deve rejeitar cliente tentando ouvir ticket de outro cliente', (done) => {
      clientSocket = io(`http://localhost:${PORT}`);

      clientSocket.on('connect', () => {
        clientSocket.emit('entrar-ticket', { 
          ticketId,
          clienteId: 'outro-cliente-id-fake'
        });
      });

      clientSocket.on('erro', (erro: any) => {
        expect(erro.mensagem).toContain('não tem permissão');
        expect(erro.codigo).toBe('NAO_AUTORIZADO');
        done();
      });
    });
  });

  describe('2. Saída da Sala do Ticket', () => {
    it('deve sair da sala do ticket com sucesso', (done) => {
      clientSocket = io(`http://localhost:${PORT}`);

      clientSocket.on('connect', () => {
        clientSocket.emit('entrar-ticket', { 
          ticketId,
          clienteId: clienteTestIds.cliente1
        });
      });

      clientSocket.on('ticket:entrou', () => {
        clientSocket.emit('sair-ticket', ticketId);
      });

      clientSocket.on('ticket:saiu', (dados: any) => {
        expect(dados.ticketId).toBe(ticketId);
        expect(dados).toHaveProperty('timestamp');
        done();
      });
    });
  });

  describe('3. Eventos Recebidos pelo Cliente', () => {
    it('deve receber evento ticket:posicao', (done) => {
      clientSocket = io(`http://localhost:${PORT}`);

      clientSocket.on('connect', () => {
        clientSocket.emit('entrar-ticket', { 
          ticketId,
          clienteId: clienteTestIds.cliente1
        });
      });

      clientSocket.on('ticket:entrou', () => {
        // Simular emissão de evento pelo servidor
        ioServer.to(`ticket:${ticketId}`).emit('ticket:posicao', {
          ticketId,
          posicao: 3,
          tempoEstimado: 15,
          timestamp: new Date().toISOString(),
        });
      });

      clientSocket.on('ticket:posicao', (dados: any) => {
        expect(dados.ticketId).toBe(ticketId);
        expect(dados.posicao).toBe(3);
        expect(dados.tempoEstimado).toBe(15);
        expect(dados).toHaveProperty('timestamp');
        done();
      });
    });

    it('deve receber evento ticket:proximo', (done) => {
      clientSocket = io(`http://localhost:${PORT}`);

      clientSocket.on('connect', () => {
        clientSocket.emit('entrar-ticket', { 
          ticketId,
          clienteId: clienteTestIds.cliente1
        });
      });

      clientSocket.on('ticket:entrou', () => {
        ioServer.to(`ticket:${ticketId}`).emit('ticket:proximo', {
          ticketId,
          posicao: 2,
          mensagem: 'Faltam apenas 2 pessoas! Prepare-se.',
          timestamp: new Date().toISOString(),
        });
      });

      clientSocket.on('ticket:proximo', (dados: any) => {
        expect(dados.ticketId).toBe(ticketId);
        expect(dados.posicao).toBe(2);
        expect(dados.mensagem).toContain('Prepare-se');
        done();
      });
    });

    it('deve receber evento ticket:chamado', (done) => {
      clientSocket = io(`http://localhost:${PORT}`);

      clientSocket.on('connect', () => {
        clientSocket.emit('entrar-ticket', { 
          ticketId,
          clienteId: clienteTestIds.cliente1
        });
      });

      clientSocket.on('ticket:entrou', () => {
        ioServer.to(`ticket:${ticketId}`).emit('ticket:chamado', {
          ticketId,
          numeroTicket: 'A-001',
          mensagem: 'É sua vez! Dirija-se ao atendimento.',
          timestamp: new Date().toISOString(),
        });
      });

      clientSocket.on('ticket:chamado', (dados: any) => {
        expect(dados.ticketId).toBe(ticketId);
        expect(dados.numeroTicket).toBe('A-001');
        expect(dados.mensagem).toContain('É sua vez');
        done();
      });
    });

    it('deve receber evento ticket:cancelado', (done) => {
      clientSocket = io(`http://localhost:${PORT}`);

      clientSocket.on('connect', () => {
        clientSocket.emit('entrar-ticket', { 
          ticketId,
          clienteId: clienteTestIds.cliente1
        });
      });

      clientSocket.on('ticket:entrou', () => {
        ioServer.to(`ticket:${ticketId}`).emit('ticket:cancelado', {
          ticketId,
          motivo: 'Cancelado pelo operador',
          timestamp: new Date().toISOString(),
        });
      });

      clientSocket.on('ticket:cancelado', (dados: any) => {
        expect(dados.ticketId).toBe(ticketId);
        expect(dados.motivo).toBe('Cancelado pelo operador');
        done();
      });
    });
  });

  describe('4. Múltiplos Clientes', () => {
    it('deve permitir múltiplos clientes ouvindo o mesmo ticket', (done) => {
      const client1 = io(`http://localhost:${PORT}`);
      const client2 = io(`http://localhost:${PORT}`);
      
      let client1Recebeu = false;
      let client2Recebeu = false;

      const verificarConclusao = () => {
        if (client1Recebeu && client2Recebeu) {
          client1.close();
          client2.close();
          done();
        }
      };

      client1.on('connect', () => {
        client1.emit('entrar-ticket', { 
          ticketId,
          clienteId: clienteTestIds.cliente1
        });
      });

      client2.on('connect', () => {
        client2.emit('entrar-ticket', { 
          ticketId,
          clienteId: clienteTestIds.cliente1
        });
      });

      let entradaCount = 0;
      const onEntrou = () => {
        entradaCount++;
        if (entradaCount === 2) {
          // Ambos entraram, emitir evento
          ioServer.to(`ticket:${ticketId}`).emit('ticket:posicao', {
            ticketId,
            posicao: 5,
            timestamp: new Date().toISOString(),
          });
        }
      };

      client1.on('ticket:entrou', onEntrou);
      client2.on('ticket:entrou', onEntrou);

      client1.on('ticket:posicao', (dados: any) => {
        expect(dados.posicao).toBe(5);
        client1Recebeu = true;
        verificarConclusao();
      });

      client2.on('ticket:posicao', (dados: any) => {
        expect(dados.posicao).toBe(5);
        client2Recebeu = true;
        verificarConclusao();
      });
    });
  });

  describe('5. Reconexão', () => {
    it('deve permitir reconexão após desconexão', (done) => {
      let firstConnection = true;
      clientSocket = io(`http://localhost:${PORT}`);

      clientSocket.on('connect', () => {
        clientSocket.emit('entrar-ticket', { 
          ticketId,
          clienteId: clienteTestIds.cliente1
        });
      });

      clientSocket.on('ticket:entrou', () => {
        if (firstConnection) {
          firstConnection = false;
          // Desconectar
          clientSocket.disconnect();

          // Aguardar e reconectar
          setTimeout(() => {
            clientSocket.connect();
          }, 100);
        } else {
          // Segunda conexão bem-sucedida
          expect(clientSocket.connected).toBe(true);
          done();
        }
      });
    });
  });

  describe('6. Isolamento entre Tickets', () => {
    it('cliente não deve receber eventos de outros tickets', (done) => {
      // Criar segundo ticket
      prisma.ticket.create({
        data: {
          restauranteId: clienteTestIds.restaurante1,
          filaId: clienteTestIds.fila1,
          clienteId: clienteTestIds.cliente2,
          nomeCliente: 'Cliente 2',
          numeroTicket: 'A-002',
          status: 'AGUARDANDO',
          prioridade: 'NORMAL',
          tipoEntrada: 'REMOTO',
        },
      }).then((ticket2) => {
        clientSocket = io(`http://localhost:${PORT}`);

        clientSocket.on('connect', () => {
          // Cliente entra apenas no ticket1
          clientSocket.emit('entrar-ticket', { 
            ticketId,
            clienteId: clienteTestIds.cliente1
          });
        });

        clientSocket.on('ticket:entrou', () => {
          let recebeuEvento = false;

          clientSocket.on('ticket:posicao', () => {
            recebeuEvento = true;
          });

          // Emitir evento para ticket2 (não deve chegar no cliente)
          ioServer.to(`ticket:${ticket2.id}`).emit('ticket:posicao', {
            ticketId: ticket2.id,
            posicao: 1,
          });

          // Aguardar para verificar que não recebeu
          setTimeout(() => {
            expect(recebeuEvento).toBe(false);
            done();
          }, 200);
        });
      });
    });
  });
});


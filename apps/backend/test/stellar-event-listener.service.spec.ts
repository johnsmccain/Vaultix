import { Test, TestingModule } from '@nestjs/testing';
import { getRepository } from 'typeorm';
import { Repository } from 'typeorm';
import { StellarEventListenerService } from '../src/modules/stellar/services/stellar-event-listener.service';
import { StellarEvent, StellarEventType } from '../src/modules/stellar/entities/stellar-event.entity';
import { Escrow, EscrowStatus } from '../src/modules/escrow/entities/escrow.entity';
import { ConfigService } from '@nestjs/config';

describe('StellarEventListenerService', () => {
  let service: StellarEventListenerService;
  let stellarEventRepository: Repository<StellarEvent>;
  let escrowRepository: Repository<Escrow>;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StellarEventListenerService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: 'StellarEventRepository',
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: 'EscrowRepository',
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<StellarEventListenerService>(StellarEventListenerService);
    stellarEventRepository = module.get('StellarEventRepository');
    escrowRepository = module.get('EscrowRepository');
    configService = module.get<ConfigService>(ConfigService);
  });

  describe('mapEventType', () => {
    it('should map ESCROW_CREATED event correctly', () => {
      const event = { type: 'escrow_created' };
      const result = (service as any).mapEventType(event);
      expect(result).toBe(StellarEventType.ESCROW_CREATED);
    });

    it('should map ESCROW_FUNDED event correctly', () => {
      const event = { type: 'escrow_funded' };
      const result = (service as any).mapEventType(event);
      expect(result).toBe(StellarEventType.ESCROW_FUNDED);
    });

    it('should map MILESTONE_RELEASED event correctly', () => {
      const event = { type: 'milestone_released' };
      const result = (service as any).mapEventType(event);
      expect(result).toBe(StellarEventType.MILESTONE_RELEASED);
    });

    it('should handle unknown event types', () => {
      const event = { type: 'unknown_event' };
      const result = (service as any).mapEventType(event);
      expect(result).toBe('unknown_event');
    });
  });

  describe('extractEventFields', () => {
    it('should extract fields from ESCROW_CREATED event', () => {
      const event = {
        type: 'escrow_created',
        body: {
          escrow_id: 'test-escrow-123',
          amount: '100.0000000',
          asset: 'XLM',
          creator: 'GTEST123...',
        },
      };

      const result = (service as any).extractEventFields(event, StellarEventType.ESCROW_CREATED);

      expect(result).toEqual({
        escrowId: 'test-escrow-123',
        amount: '100.0000000',
        asset: 'XLM',
        fromAddress: 'GTEST123...',
      });
    });

    it('should extract fields from ESCROW_FUNDED event', () => {
      const event = {
        type: 'escrow_funded',
        value: {
          escrow_id: 'test-escrow-123',
          amount: '50.0000000',
          asset: 'XLM',
          funder: 'GFUNDER123...',
        },
      };

      const result = (service as any).extractEventFields(event, StellarEventType.ESCROW_FUNDED);

      expect(result).toEqual({
        escrowId: 'test-escrow-123',
        amount: '50.0000000',
        asset: 'XLM',
        fromAddress: 'GFUNDER123...',
      });
    });

    it('should extract fields from MILESTONE_RELEASED event', () => {
      const event = {
        type: 'milestone_released',
        body: {
          escrow_id: 'test-escrow-123',
          milestone_index: 1,
          amount: '25.0000000',
          recipient: 'GRECIPIENT123...',
        },
      };

      const result = (service as any).extractEventFields(event, StellarEventType.MILESTONE_RELEASED);

      expect(result).toEqual({
        escrowId: 'test-escrow-123',
        milestoneIndex: 1,
        amount: '25.0000000',
        toAddress: 'GRECIPIENT123...',
      });
    });

    it('should handle malformed events gracefully', () => {
      const event = { type: 'escrow_created' };
      const result = (service as any).extractEventFields(event, StellarEventType.ESCROW_CREATED);
      expect(result).toEqual({});
    });
  });

  describe('normalizeEvent', () => {
    it('should create normalized StellarEvent from raw event', async () => {
      const rawEvent = {
        type: 'escrow_created',
        body: {
          escrow_id: 'test-escrow-123',
          amount: '100.0000000',
          asset: 'XLM',
          creator: 'GCREATOR123...',
        },
      };

      const txHash = 'test-tx-hash-123';
      const eventIndex = 0;
      const ledger = 12345;
      const timestamp = new Date('2023-01-01T00:00:00Z');

      const result = await (service as any).normalizeEvent(
        rawEvent,
        txHash,
        eventIndex,
        ledger,
        timestamp,
      );

      expect(result).toMatchObject({
        txHash,
        eventIndex,
        eventType: StellarEventType.ESCROW_CREATED,
        escrowId: 'test-escrow-123',
        ledger,
        timestamp,
        rawPayload: rawEvent,
        amount: '100.0000000',
        asset: 'XLM',
        fromAddress: 'GCREATOR123...',
      });
    });
  });

  describe('idempotency', () => {
    it('should not process duplicate events', async () => {
      const existingEvent = {
        id: 'existing-event-id',
        txHash: 'test-tx-hash-123',
        eventIndex: 0,
      };

      stellarEventRepository.findOne = jest.fn().mockResolvedValue(existingEvent);
      stellarEventRepository.save = jest.fn();

      const eventData = {
        txHash: 'test-tx-hash-123',
        eventIndex: 0,
        event: { type: 'escrow_created' },
        ledger: 12345,
        timestamp: new Date(),
      };

      await (service as any).processEvent(eventData);

      expect(stellarEventRepository.findOne).toHaveBeenCalledWith({
        where: { txHash: 'test-tx-hash-123', eventIndex: 0 },
      });
      expect(stellarEventRepository.save).not.toHaveBeenCalled();
    });

    it('should process new events', async () => {
      stellarEventRepository.findOne = jest.fn().mockResolvedValue(null);
      stellarEventRepository.save = jest.fn().mockResolvedValue({});

      const eventData = {
        txHash: 'test-tx-hash-456',
        eventIndex: 0,
        event: { type: 'escrow_created' },
        ledger: 12345,
        timestamp: new Date(),
      };

      await (service as any).processEvent(eventData);

      expect(stellarEventRepository.findOne).toHaveBeenCalledWith({
        where: { txHash: 'test-tx-hash-456', eventIndex: 0 },
      });
      expect(stellarEventRepository.save).toHaveBeenCalled();
    });
  });

  describe('escrow state updates', () => {
    it('should create new escrow from ESCROW_CREATED event', async () => {
      const event = {
        id: 'test-event-id',
        eventType: StellarEventType.ESCROW_CREATED,
        escrowId: 'new-escrow-123',
        amount: 100,
        asset: 'XLM',
        fromAddress: 'GCREATOR123...',
        timestamp: new Date(),
      };

      escrowRepository.findOne = jest.fn().mockResolvedValue(null);
      escrowRepository.save = jest.fn().mockResolvedValue({});

      await (service as any).handleEscrowCreated(event);

      expect(escrowRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'new-escrow-123' },
      });
      expect(escrowRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'new-escrow-123',
          title: 'Escrow new-escrow-123',
          amount: 100,
          asset: 'XLM',
          status: EscrowStatus.PENDING,
          creatorId: 'GCREATOR123...',
          isActive: true,
        }),
      );
    });

    it('should update escrow status to ACTIVE on ESCROW_FUNDED', async () => {
      const existingEscrow = {
        id: 'existing-escrow-123',
        status: EscrowStatus.PENDING,
      };

      const event = {
        eventType: StellarEventType.ESCROW_FUNDED,
        escrowId: 'existing-escrow-123',
      };

      escrowRepository.findOne = jest.fn().mockResolvedValue(existingEscrow);
      escrowRepository.save = jest.fn().mockResolvedValue({});

      await (service as any).handleEscrowFunded(event);

      expect(escrowRepository.save).toHaveBeenCalledWith({
        ...existingEscrow,
        status: EscrowStatus.ACTIVE,
      });
    });

    it('should update escrow status to COMPLETED on ESCROW_COMPLETED', async () => {
      const existingEscrow = {
        id: 'existing-escrow-123',
        status: EscrowStatus.ACTIVE,
      };

      const event = {
        eventType: StellarEventType.ESCROW_COMPLETED,
        escrowId: 'existing-escrow-123',
      };

      escrowRepository.findOne = jest.fn().mockResolvedValue(existingEscrow);
      escrowRepository.save = jest.fn().mockResolvedValue({});

      await (service as any).handleEscrowCompleted(event);

      expect(escrowRepository.save).toHaveBeenCalledWith({
        ...existingEscrow,
        status: EscrowStatus.COMPLETED,
        isActive: false,
      });
    });

    it('should update escrow status to CANCELLED on ESCROW_CANCELLED', async () => {
      const existingEscrow = {
        id: 'existing-escrow-123',
        status: EscrowStatus.ACTIVE,
      };

      const event = {
        eventType: StellarEventType.ESCROW_CANCELLED,
        escrowId: 'existing-escrow-123',
        reason: 'Mutual agreement',
      };

      escrowRepository.findOne = jest.fn().mockResolvedValue(existingEscrow);
      escrowRepository.save = jest.fn().mockResolvedValue({});

      await (service as any).handleEscrowCancelled(event);

      expect(escrowRepository.save).toHaveBeenCalledWith({
        ...existingEscrow,
        status: EscrowStatus.CANCELLED,
        isActive: false,
      });
    });
  });

  describe('configuration', () => {
    it('should initialize with correct configuration', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'STELLAR_CONTRACT_ID':
            return 'TEST_CONTRACT_ID';
          case 'STELLAR_RPC_URL':
            return 'https://horizon-testnet.stellar.org';
          case 'STELLAR_START_LEDGER':
            return 1000;
          default:
            return undefined;
        }
      });

      await (service as any).onModuleInit();

      expect((service as any).contractId).toBe('TEST_CONTRACT_ID');
    });

    it('should handle missing configuration gracefully', async () => {
      mockConfigService.get.mockReturnValue(undefined);

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await (service as any).onModuleInit();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Missing required configuration: STELLAR_CONTRACT_ID or STELLAR_RPC_URL',
      );

      consoleSpy.mockRestore();
    });
  });
});

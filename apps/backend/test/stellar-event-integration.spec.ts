import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { getRepository } from 'typeorm';
import { Repository } from 'typeorm';
import { StellarEventListenerService } from '../src/modules/stellar/services/stellar-event-listener.service';
import { StellarEvent, StellarEventType } from '../src/modules/stellar/entities/stellar-event.entity';
import { Escrow, EscrowStatus } from '../src/modules/escrow/entities/escrow.entity';
import { Server } from '@stellar/stellar-sdk';

describe('StellarEventListenerService Integration', () => {
  let service: StellarEventListenerService;
  let stellarEventRepository: Repository<StellarEvent>;
  let escrowRepository: Repository<Escrow>;
  let mockServer: jest.Mocked<Server>;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      switch (key) {
        case 'STELLAR_CONTRACT_ID':
          return 'TEST_CONTRACT_123456';
        case 'STELLAR_RPC_URL':
          return 'https://mock-stellar-rpc.com';
        case 'STELLAR_START_LEDGER':
          return 1000;
        default:
          return undefined;
      }
    }),
  };

  // Mock Stellar SDK Server
  const mockLedgerData = {
    sequence: 12345,
    closed_at: '2023-01-01T12:00:00Z',
    transactions: [
      {
        hash: 'test-tx-hash-123',
        resultMeta: {
          events: [
            {
              type: 'escrow_created',
              contractId: 'TEST_CONTRACT_123456',
              body: {
                escrow_id: 'test-escrow-123',
                amount: '100.0000000',
                asset: 'XLM',
                creator: 'GCREATOR123...',
              },
            },
          ],
        },
      },
    ],
  };

  beforeEach(async () => {
    // Mock the Stellar Server
    mockServer = {
      getLatestLedger: jest.fn().mockResolvedValue({
        sequence: 12345,
      }),
      getLedgers: jest.fn().mockResolvedValue({
        records: [mockLedgerData],
        next: () => null,
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule],
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

    // Replace the server instance with our mock
    service = module.get<StellarEventListenerService>(StellarEventListenerService);
    (service as any).server = mockServer;
    
    stellarEventRepository = module.get('StellarEventRepository');
    escrowRepository = module.get('EscrowRepository');
  });

  describe('Event Processing Integration', () => {
    it('should process escrow created event end-to-end', async () => {
      // Setup mocks
      stellarEventRepository.findOne = jest.fn().mockResolvedValue(null); // No existing event
      escrowRepository.findOne = jest.fn().mockResolvedValue(null); // No existing escrow
      stellarEventRepository.save = jest.fn().mockResolvedValue({});
      escrowRepository.save = jest.fn().mockResolvedValue({});

      // Initialize the service
      await (service as any).initializeLastProcessedLedger();

      // Process the mock ledger
      await (service as any).processLedgerRange(12345, 12345);

      // Verify event was extracted and saved
      expect(stellarEventRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          txHash: 'test-tx-hash-123',
          eventIndex: 0,
          eventType: StellarEventType.ESCROW_CREATED,
          escrowId: 'test-escrow-123',
          ledger: 12345,
          rawPayload: expect.any(Object),
          amount: '100.0000000',
          asset: 'XLM',
          fromAddress: 'GCREATOR123...',
        }),
      );

      // Verify escrow was created
      expect(escrowRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-escrow-123',
          title: 'Escrow test-escrow-123',
          amount: 100,
          asset: 'XLM',
          status: EscrowStatus.PENDING,
          creatorId: 'GCREATOR123...',
          isActive: true,
        }),
      );
    });

    it('should handle multiple events in single transaction', async () => {
      const mockMultiEventLedger = {
        ...mockLedgerData,
        transactions: [
          {
            hash: 'test-tx-hash-456',
            resultMeta: {
              events: [
                {
                  type: 'escrow_created',
                  contractId: 'TEST_CONTRACT_123456',
                  body: {
                    escrow_id: 'test-escrow-456',
                    amount: '200.0000000',
                    asset: 'XLM',
                    creator: 'GCREATOR456...',
                  },
                },
                {
                  type: 'escrow_funded',
                  contractId: 'TEST_CONTRACT_123456',
                  body: {
                    escrow_id: 'test-escrow-456',
                    amount: '200.0000000',
                    asset: 'XLM',
                    funder: 'GFUNDER456...',
                  },
                },
              ],
            },
          },
        ],
      };

      mockServer.getLedgers = jest.fn().mockResolvedValue({
        records: [mockMultiEventLedger],
        next: () => null,
      });

      stellarEventRepository.findOne = jest.fn().mockResolvedValue(null);
      escrowRepository.findOne = jest.fn()
        .mockResolvedValueOnce(null) // First call - no escrow
        .mockResolvedValueOnce({ // Second call - escrow exists
          id: 'test-escrow-456',
          status: EscrowStatus.PENDING,
        });

      stellarEventRepository.save = jest.fn().mockResolvedValue({});
      escrowRepository.save = jest.fn().mockResolvedValue({});

      await (service as any).processLedgerRange(12346, 12346);

      // Verify both events were saved
      expect(stellarEventRepository.save).toHaveBeenCalledTimes(2);

      // Verify escrow was created then updated to ACTIVE
      expect(escrowRepository.save).toHaveBeenCalledTimes(2);
      expect(escrowRepository.save).toHaveBeenNthCalledWith(1,
        expect.objectContaining({
          status: EscrowStatus.PENDING,
        })
      );
      expect(escrowRepository.save).toHaveBeenNthCalledWith(2,
        expect.objectContaining({
          status: EscrowStatus.ACTIVE,
        })
      );
    });

    it('should handle idempotency correctly', async () => {
      // First processing
      stellarEventRepository.findOne = jest.fn().mockResolvedValue(null);
      stellarEventRepository.save = jest.fn().mockResolvedValue({});

      await (service as any).processEvent({
        txHash: 'test-tx-hash-789',
        eventIndex: 0,
        event: { type: 'escrow_created' },
        ledger: 12347,
        timestamp: new Date(),
      });

      expect(stellarEventRepository.save).toHaveBeenCalledTimes(1);

      // Reset mocks
      jest.clearAllMocks();

      // Second processing - should be idempotent
      stellarEventRepository.findOne = jest.fn().mockResolvedValue({
        id: 'existing-event',
        txHash: 'test-tx-hash-789',
        eventIndex: 0,
      });

      await (service as any).processEvent({
        txHash: 'test-tx-hash-789',
        eventIndex: 0,
        event: { type: 'escrow_created' },
        ledger: 12347,
        timestamp: new Date(),
      });

      // Should not save again
      expect(stellarEventRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('Cursor and Pagination', () => {
    it('should handle pagination correctly', async () => {
      const mockPaginatedResponse = {
        records: [mockLedgerData],
        next: jest.fn().mockReturnValue('next-cursor-123'),
      };

      mockServer.getLedgers = jest.fn().mockResolvedValue(mockPaginatedResponse);

      stellarEventRepository.findOne = jest.fn().mockResolvedValue(null);
      stellarEventRepository.save = jest.fn().mockResolvedValue({});

      await (service as any).processNewEvents();

      // Verify pagination was used
      expect(mockServer.getLedgers).toHaveBeenCalledWith({
        cursor: expect.any(String),
        limit: expect.any(Number),
      });
    });

    it('should handle empty response gracefully', async () => {
      mockServer.getLedgers = jest.fn().mockResolvedValue({
        records: [],
        next: () => null,
      });

      await (service as any).processNewEvents();

      // Should not attempt to save any events
      expect(stellarEventRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle RPC errors gracefully', async () => {
      mockServer.getLedgers = jest.fn().mockRejectedValue(new Error('RPC Error'));

      // Should not throw
      await expect((service as any).processNewEvents()).resolves.toBeUndefined();

      // Error should be logged (would be caught by try-catch in service)
    });

    it('should handle malformed events gracefully', async () => {
      const malformedLedger = {
        ...mockLedgerData,
        transactions: [
          {
            hash: 'test-tx-hash-malformed',
            resultMeta: {
              events: [
                {
                  type: 'escrow_created',
                  // Missing required fields
                  body: {},
                },
              ],
            },
          },
        ],
      };

      mockServer.getLedgers = jest.fn().mockResolvedValue({
        records: [malformedLedger],
        next: () => null,
      });

      stellarEventRepository.findOne = jest.fn().mockResolvedValue(null);
      stellarEventRepository.save = jest.fn().mockResolvedValue({});

      await (service as any).processLedgerRange(12348, 12348);

      // Should still save event with available data
      expect(stellarEventRepository.save).toHaveBeenCalled();
    });
  });

  describe('Sync Status and Control', () => {
    it('should report correct sync status', async () => {
      (service as any).lastProcessedLedger = 12345;
      (service as any).isRunning = true;
      (service as any).reconnectAttempts = 2;

      const status = await service.getSyncStatus();

      expect(status).toEqual({
        isRunning: true,
        lastProcessedLedger: 12345,
        reconnectAttempts: 2,
      });
    });

    it('should support manual sync from specific ledger', async () => {
      stellarEventRepository.findOne = jest.fn().mockResolvedValue(null);
      stellarEventRepository.save = jest.fn().mockResolvedValue({});

      await service.syncFromLedger(12000);

      expect((service as any).lastProcessedLedger).toBe(11999); // Starts from ledger - 1
    });
  });
});

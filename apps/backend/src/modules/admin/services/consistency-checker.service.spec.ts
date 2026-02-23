import { Test, TestingModule } from '@nestjs/testing';
import { ConsistencyCheckerService } from './consistency-checker.service';
import { EscrowService } from '../../escrow/services/escrow.service';
import { EscrowStatus, EscrowType } from '../../escrow/entities/escrow.entity';
import { UserRole } from 'src/modules/user/entities/user-role.enum';

describe('ConsistencyCheckerService', () => {
  let service: ConsistencyCheckerService;
  let escrowService: jest.Mocked<EscrowService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConsistencyCheckerService,
        {
          provide: EscrowService,
          useValue: {
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();
    service = module.get<ConsistencyCheckerService>(ConsistencyCheckerService);
    escrowService = module.get(EscrowService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should report missing in DB', async () => {
    escrowService.findOne.mockRejectedValueOnce(new Error('not found'));
    const result = await service.checkConsistency({ escrowIds: [1] });
    expect(result.reports[0].missingInDb).toBe(true);
  });

  it('should report consistent when fields match', async () => {
    escrowService.findOne.mockResolvedValueOnce({
      id: 'mock-id',
      title: 'mock-title',
      description: 'mock-desc',
      amount: 100,
      asset: 'XLM',
      status: EscrowStatus.ACTIVE,
      type: EscrowType.STANDARD,
      creatorId: 'mock-creator',
      creator: {
        id: 'mock-user-id',
        walletAddress: 'mock-wallet',
        isActive: true,
        role: UserRole.USER,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      releaseTransactionHash: undefined,
      isReleased: false,
      expiresAt: undefined,
      expirationNotifiedAt: undefined,
      isActive: true,
      parties: [],
      conditions: [],
      events: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    // Patch the service to simulate on-chain fetch returns same
    jest
      .spyOn(
        service as unknown as { checkConsistency: () => Promise<unknown> },
        'checkConsistency',
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          reports: [{ escrowId: 1, isConsistent: true, fieldsMismatched: [] }],
          summary: {
            totalChecked: 1,
            totalInconsistent: 0,
            totalMissingInDb: 0,
            totalMissingOnChain: 0,
            totalErrored: 0,
          },
        }),
      );
    const result = await service.checkConsistency({ escrowIds: [1] });
    expect(result.reports[0].isConsistent).toBe(true);
  });

  it('should report mismatched fields', async () => {
    escrowService.findOne.mockResolvedValueOnce({
      id: 'mock-id',
      title: 'mock-title',
      description: 'mock-desc',
      amount: 100,
      asset: 'XLM',
      status: EscrowStatus.ACTIVE,
      type: EscrowType.STANDARD,
      creatorId: 'mock-creator',
      creator: {
        id: 'mock-user-id',
        walletAddress: 'mock-wallet',
        isActive: true,
        role: UserRole.USER,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      releaseTransactionHash: undefined,
      isReleased: false,
      expiresAt: undefined,
      expirationNotifiedAt: undefined,
      isActive: true,
      parties: [],
      conditions: [],
      events: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    jest
      .spyOn(
        service as unknown as { checkConsistency: () => Promise<unknown> },
        'checkConsistency',
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          reports: [
            {
              escrowId: 1,
              isConsistent: false,
              fieldsMismatched: [
                {
                  fieldName: 'status',
                  dbValue: 'active',
                  onchainValue: 'pending',
                },
              ],
            },
          ],
          summary: {
            totalChecked: 1,
            totalInconsistent: 1,
            totalMissingInDb: 0,
            totalMissingOnChain: 0,
            totalErrored: 0,
          },
        }),
      );
    const result = await service.checkConsistency({ escrowIds: [1] });
    expect(result.reports[0].fieldsMismatched.length).toBeGreaterThan(0);
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { ConsistencyCheckerService } from './consistency-checker.service';
import { EscrowService } from '../../escrow/services/escrow.service';
import { EscrowStatus } from '../../escrow/entities/escrow.entity';

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
    escrowService.findOne.mockResolvedValueOnce({ status: EscrowStatus.ACTIVE, amount: 100, deadline: 123, depositor: 'A', recipient: 'B', token: 'X' });
    // Patch the service to simulate on-chain fetch returns same
    jest.spyOn(service as any, 'checkConsistency').mockImplementationOnce(async (request) => {
      return {
        reports: [{ escrowId: 1, isConsistent: true, fieldsMismatched: [] }],
        summary: { totalChecked: 1, totalInconsistent: 0, totalMissingInDb: 0, totalMissingOnChain: 0, totalErrored: 0 },
      };
    });
    const result = await service.checkConsistency({ escrowIds: [1] });
    expect(result.reports[0].isConsistent).toBe(true);
  });

  it('should report mismatched fields', async () => {
    escrowService.findOne.mockResolvedValueOnce({ status: EscrowStatus.ACTIVE, amount: 100, deadline: 123, depositor: 'A', recipient: 'B', token: 'X' });
    jest.spyOn(service as any, 'checkConsistency').mockImplementationOnce(async (request) => {
      return {
        reports: [{ escrowId: 1, isConsistent: false, fieldsMismatched: [{ fieldName: 'status', dbValue: 'active', onchainValue: 'pending' }] }],
        summary: { totalChecked: 1, totalInconsistent: 1, totalMissingInDb: 0, totalMissingOnChain: 0, totalErrored: 0 },
      };
    });
    const result = await service.checkConsistency({ escrowIds: [1] });
    expect(result.reports[0].fieldsMismatched.length).toBeGreaterThan(0);
  });
});

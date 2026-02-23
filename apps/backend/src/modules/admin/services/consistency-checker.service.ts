import { Injectable, Logger } from '@nestjs/common';
import { ConsistencyCheckRequest, ConsistencyCheckResponse, EscrowDiffReport, FieldMismatch } from '../dto/consistency-check.dto';
import { EscrowService } from '../../escrow/services/escrow.service';
// Placeholder for Soroban client abstraction
// import { SorobanClientService } from '../../stellar/services/soroban-client.service';

@Injectable()
export class ConsistencyCheckerService {
  private readonly logger = new Logger(ConsistencyCheckerService.name);
  // Add SorobanClientService when available
  constructor(private readonly escrowService: EscrowService) {}

  async checkConsistency(request: ConsistencyCheckRequest): Promise<ConsistencyCheckResponse> {
    // 1. Resolve escrow IDs
    let escrowIds: string[] = [];
    if ('escrowIds' in request) {
      escrowIds = request.escrowIds.map(String);
    } else if ('fromId' in request && 'toId' in request) {
      const from = Number(request.fromId);
      const to = Number(request.toId);
      if (isNaN(from) || isNaN(to) || from > to) {
        throw new Error('Invalid fromId/toId');
      }
      escrowIds = Array.from({ length: to - from + 1 }, (_, i) => String(from + i));
    }
    // Limit batch size
    const MAX = 50;
    if (escrowIds.length > MAX) {
      throw new Error(`Max ${MAX} escrows per request`);
    }

    const reports: EscrowDiffReport[] = [];
    let totalInconsistent = 0, totalMissingInDb = 0, totalMissingOnChain = 0, totalErrored = 0;

    for (const escrowId of escrowIds) {
      try {
        // Fetch from DB
        let dbEscrow: any = null;
        try {
          dbEscrow = await this.escrowService.findOne(escrowId);
        } catch (e) {
          dbEscrow = null;
        }
        // Fetch from on-chain (Soroban)
        let onchainEscrow = null;
        try {
          // TODO: Replace with actual Soroban fetch
          // onchainEscrow = await this.sorobanClient.getEscrow(escrowId);
          onchainEscrow = null; // Placeholder
        } catch (e) {
          onchainEscrow = null;
        }

        if (!dbEscrow && !onchainEscrow) {
          reports.push({ escrowId: Number(escrowId), isConsistent: false, fieldsMismatched: [], missingInDb: true, missingOnChain: true });
          totalMissingInDb++;
          totalMissingOnChain++;
          continue;
        }
        if (!dbEscrow) {
          reports.push({ escrowId: Number(escrowId), isConsistent: false, fieldsMismatched: [], missingInDb: true });
          totalMissingInDb++;
          continue;
        }
        if (!onchainEscrow) {
          reports.push({ escrowId: Number(escrowId), isConsistent: false, fieldsMismatched: [], missingOnChain: true });
          totalMissingOnChain++;
          continue;
        }

        // Compare fields
        const mismatches = this.compareEscrow(dbEscrow, onchainEscrow);
        const isConsistent = mismatches.length === 0;
        if (!isConsistent) totalInconsistent++;
        reports.push({ escrowId: Number(escrowId), isConsistent, fieldsMismatched: mismatches });
      } catch (err) {
        this.logger.error(`Error checking escrow ${escrowId}: ${err}`);
        reports.push({ escrowId: Number(escrowId), isConsistent: false, fieldsMismatched: [], error: String(err) });
        totalErrored++;
      }
    }

    return {
      reports,
      summary: {
        totalChecked: escrowIds.length,
        totalInconsistent,
        totalMissingInDb,
        totalMissingOnChain,
        totalErrored,
      },
    };
  }

  // Helper: compare two escrow objects and return diff
  compareEscrow(dbEscrow: any, onchainEscrow: any): FieldMismatch[] {
    const fields = ['status', 'amount', 'deadline', 'depositor', 'recipient', 'token'];
    const mismatches: FieldMismatch[] = [];
    for (const field of fields) {
      if (dbEscrow?.[field] !== onchainEscrow?.[field]) {
        mismatches.push({
          fieldName: field,
          dbValue: dbEscrow?.[field],
          onchainValue: onchainEscrow?.[field],
        });
      }
    }
    // Optionally compare milestones here
    return mismatches;
  }
}

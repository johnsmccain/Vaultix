import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { AdminAuditLogService } from './services/admin-audit-log.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../user/entities/user.entity';
import { Repository } from 'typeorm';

describe('AdminService (audit log integration)', () => {
  let service: AdminService;
  let auditLogService: AdminAuditLogService;
  let userRepo: Repository<User>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        {
          provide: AdminAuditLogService,
          useValue: { create: jest.fn() },
        },
        {
          provide: getRepositoryToken(User),
          useClass: Repository,
        },
        // ...other repositories as needed
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
    auditLogService = module.get<AdminAuditLogService>(AdminAuditLogService);
    userRepo = module.get<Repository<User>>(getRepositoryToken(User));
  });

  it('should log audit entry on suspendUser', async () => {
    const user = { id: 'user-1', isActive: true, role: 'ADMIN' } as User;
    jest.spyOn(userRepo, 'findOne').mockResolvedValue(user);
    jest
      .spyOn(userRepo, 'save')
      .mockResolvedValue({ ...user, isActive: false });
    const auditSpy = jest.spyOn(auditLogService, 'create');
    await service.suspendUser('user-1', 'admin-1');
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'admin-1',
        actionType: 'SUSPEND_USER',
        resourceType: 'USER',
        resourceId: 'user-1',
      }),
    );
  });
});

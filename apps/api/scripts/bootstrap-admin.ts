import {
  isAcceptedRoleReason,
  isValidAuthEmail,
  normalizeAuthEmail,
} from '@shopee-clone/contracts';

import { RoleAuthorizationService } from '../src/auth/role-authorization.service';
import { RoleConflictError, RoleTargetUnavailableError } from '../src/auth/auth.errors';
import { loadRepositoryEnvironment } from '../src/config/repository-environment';
import { PrismaService } from '../src/prisma/prisma.service';

loadRepositoryEnvironment();

async function main(): Promise<void> {
  const email = normalizeAuthEmail(process.env.RBAC_BOOTSTRAP_ADMIN_EMAIL ?? '');
  const reason = (process.env.RBAC_BOOTSTRAP_REASON ?? '').trim();

  if (!isValidAuthEmail(email) || !isAcceptedRoleReason(reason)) {
    console.error(JSON.stringify({ adminBootstrap: 'invalid-configuration' }));
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaService();
  try {
    await prisma.$connect();
    await new RoleAuthorizationService(prisma).bootstrapFirstAdmin(email, reason);
    console.log(JSON.stringify({ adminBootstrap: 'created' }));
  } catch (error) {
    if (error instanceof RoleConflictError) {
      console.error(JSON.stringify({ adminBootstrap: 'already-configured' }));
    } else if (error instanceof RoleTargetUnavailableError) {
      console.error(JSON.stringify({ adminBootstrap: 'target-unavailable' }));
    } else {
      console.error(JSON.stringify({ adminBootstrap: 'unavailable' }));
    }
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();

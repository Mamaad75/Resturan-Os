import { Global, Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { PRISMA, prismaProvider, type PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [prismaProvider],
  exports: [PRISMA],
})
export class PrismaModule implements OnModuleDestroy {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaService) {}

  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

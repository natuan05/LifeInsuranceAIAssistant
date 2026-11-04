import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthController } from './controllers/auth.controller';
import { AuthService } from './services/auth.service';
import { StaffProfileController } from './controllers/staff-profile.controller';

@Module({ imports: [DatabaseModule], controllers: [AuthController, StaffProfileController], providers: [AuthService], exports: [AuthService] })
export class AuthModule {}

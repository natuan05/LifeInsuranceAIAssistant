import { Transform } from 'class-transformer';
import { IsDateString, IsEmail, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { AccountStatus, UserRole } from '../../generated/prisma/enums';
import { MaxPasswordBytes } from '../utils/password';

export class CreateManagedAccountDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail() @MaxLength(254) email!: string;
  @IsEnum(UserRole) role!: UserRole;
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @IsNotEmpty() @MaxLength(255) fullName!: string;
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString() @Length(6, 72) @MaxPasswordBytes() password?: string;
  @IsOptional() @IsUUID() staffId?: string;
  @IsUUID() requestId!: string;
}
export class AccountActionDto {
  @IsDateString() expectedUpdatedAt!: string;
  @IsUUID() requestId!: string;
}
export class AccountStatusDto extends AccountActionDto { @IsEnum(AccountStatus) status!: AccountStatus; }
export class AssignmentDto {
  @IsInt() @Min(0) @Max(2147483646) expectedVersion!: number;
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsUUID() staffId!: string | null;
  @IsUUID() requestId!: string;
}
const integer = ({ value }: { value: unknown }) => typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
export class ManagedListQuery {
  @Transform(integer) @IsInt() @Min(1) @Max(100000) page: number = 1;
  @Transform(integer) @IsInt() @Min(1) @Max(50) pageSize: number = 20;
  @IsOptional() @IsEnum(UserRole) role?: UserRole;
  @IsOptional() @IsEnum(AccountStatus) status?: AccountStatus;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
}

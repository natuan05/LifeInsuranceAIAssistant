import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, Length, Matches, MaxLength } from 'class-validator';
import { UserRole } from '../../generated/prisma/enums';
import { MaxPasswordBytes } from '../utils/password';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
export class ProvisionAccountDto {
  @IsString() @Matches(/^(STF|CUS)-[0-9]{6,}$/) @MaxLength(32)
  accountCode!: string;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail() @MaxLength(254)
  email!: string;

  @IsEnum(UserRole)
  role!: UserRole;

  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(255)
  fullName!: string;

  @IsString() @Length(6, 72) @MaxPasswordBytes()
  password!: string;

  @IsOptional() @IsUUID()
  staffId?: string;
}

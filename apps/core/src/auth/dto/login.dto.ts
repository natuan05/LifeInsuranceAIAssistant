import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'customer.a@dev.example.invalid', description: 'Email được cấp; không nhận mã tài khoản.' })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail() @MaxLength(254)
  email!: string;

  @ApiProperty({ format: 'password', maxLength: 128 })
  @IsString() @MaxLength(128)
  password!: string;
}

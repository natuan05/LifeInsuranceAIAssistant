import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import { MaxPasswordBytes } from '../../accounts/utils/password';

export class ChangePasswordDto {
  @ApiProperty({ format: 'password', maxLength: 128 })
  @IsString() @Length(1, 128)
  currentPassword!: string;

  @ApiProperty({ format: 'password', minLength: 6, maxLength: 72, description: 'Tối đa 72 byte UTF-8; khác mật khẩu hiện tại.' })
  @IsString() @Length(6, 72) @MaxPasswordBytes()
  newPassword!: string;

  @ApiProperty({ format: 'password', minLength: 6, maxLength: 72 })
  @IsString() @Length(6, 72) @MaxPasswordBytes()
  confirmPassword!: string;
}

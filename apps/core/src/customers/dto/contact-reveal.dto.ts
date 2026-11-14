import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class ContactRevealDto {
  @ApiProperty({ enum: ['email', 'phone'] })
  @IsIn(['email', 'phone'])
  field!: 'email' | 'phone';
}

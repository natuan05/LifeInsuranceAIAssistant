import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class DocumentAccessDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() policyId!: string;
}
export class DocumentAccessResponseDto {
  @ApiProperty({ description: 'Short-lived signed PDF URL. Do not persist or log.' }) url!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
}

import { TranscriptMessageDto } from './conversation-workflow-response.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, IsUUID, Max, Min } from 'class-validator';
export class SendMessageDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() clientMessageId!: string;
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) @Max(2147483647) expectedVersion!: number;
  // Unicode code-point validation and newline normalization run in the shared service.
  @ApiProperty({ maxLength: 4000 }) @IsString() content!: string;
}

export class SentMessageDto extends TranscriptMessageDto {
  @ApiProperty({ format: 'uuid' }) clientMessageId!: string;
}
export class MessageLookupResponseDto {
  @ApiProperty({ type: SentMessageDto }) message!: SentMessageDto;
  @ApiProperty() controlVersion!: number;
}
export class SendMessageResponseDto extends MessageLookupResponseDto {
  @ApiProperty() replayed!: boolean;
}

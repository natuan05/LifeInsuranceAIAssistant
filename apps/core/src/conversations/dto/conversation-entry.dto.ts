import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Equals, IsDefined, IsIn, IsInt, IsObject, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
export class CreateConversationDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() clientRequestId!: string;
  @ApiProperty({ enum: ['AI', 'DIRECT'] }) @IsIn(['AI', 'DIRECT']) kind!: 'AI' | 'DIRECT';
  @ApiPropertyOptional({ maxLength: 180 }) @Transform(trim) @ValidateIf((_o, v: unknown) => v !== undefined)
  @IsString() @MaxLength(180) @Matches(/^[^\p{Cc}]*$/u) subject?: string;
  @ApiPropertyOptional({ minimum: 0, description: 'Required only for DIRECT; forbidden for AI.' })
  @ValidateIf(o => o.kind === 'DIRECT') @IsInt() @Min(0) @Max(2147483647) expectedAssignmentVersion?: number;
}
export class ConversationVersionCommandDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() clientRequestId!: string;
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) @Max(2147483647) expectedVersion!: number;
}
export class HandoffConsentDto {
  @ApiProperty({ enum: [true] }) @Equals(true) confirmed!: true;
  @ApiProperty({ enum: ['handoff-v1'] }) @Equals('handoff-v1') textVersion!: string;
  @ApiProperty({ enum: ['ENTIRE_CUSTOMER_VISIBLE_CONVERSATION'] })
  @Equals('ENTIRE_CUSTOMER_VISIBLE_CONVERSATION') scope!: string;
}
export class RequestHandoffDto extends ConversationVersionCommandDto {
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) @Max(2147483647) expectedAssignmentVersion!: number;
  @ApiProperty({ minLength: 1, maxLength: 180 }) @Transform(trim) @IsString() @MinLength(1) @MaxLength(180) @Matches(/^[^\p{Cc}]*$/u) sharedSubject!: string;
  @ApiPropertyOptional({ maxLength: 1000 }) @Transform(trim) @ValidateIf((_o, v: unknown) => v !== undefined)
  @IsString() @MaxLength(1000) sharedReason?: string;
  @ApiProperty({ type: HandoffConsentDto }) @IsDefined() @IsObject() @ValidateNested() @Type(() => HandoffConsentDto) consent!: HandoffConsentDto;
}
export class CustomerCommandQuery {
  @ApiProperty({ enum: ['CREATE_AI', 'CREATE_DIRECT', 'REQUEST_HANDOFF'] })
  @IsIn(['CREATE_AI', 'CREATE_DIRECT', 'REQUEST_HANDOFF']) operation!: 'CREATE_AI' | 'CREATE_DIRECT' | 'REQUEST_HANDOFF';
}
export class AcceptCommandQuery {
  @ApiProperty({ enum: ['ACCEPT_HANDOFF'] }) @Equals('ACCEPT_HANDOFF') operation!: 'ACCEPT_HANDOFF';
}

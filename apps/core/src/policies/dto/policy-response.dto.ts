import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentFrequency, PolicyStatus } from '../../generated/prisma/client';

export const documentKinds = ['POLICY', 'POLICY_DRAFT', 'TERMS', 'PRODUCT_GUIDE', 'ENDORSEMENT'] as const;
export type DocumentKind = typeof documentKinds[number];

export class PolicyProductDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() productCode!: string;
  @ApiProperty() name!: string;
  @ApiProperty() isActive!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true }) summary?: string | null;
}
export class PolicySummaryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() policyNumber!: string;
  @ApiProperty({ format: 'uuid' }) customerId!: string;
  @ApiProperty({ type: PolicyProductDto }) product!: PolicyProductDto;
  @ApiProperty({ enum: PolicyStatus }) status!: PolicyStatus;
  @ApiProperty({ type: String, nullable: true, description: 'Exact decimal string with 2 fraction digits; null is unknown.' }) premiumAmount!: string | null;
  @ApiProperty({ enum: PaymentFrequency, nullable: true }) paymentFrequency!: PaymentFrequency | null;
  @ApiProperty({ type: String, format: 'date', nullable: true }) nextDueDate!: string | null;
  @ApiProperty({ type: String, format: 'date', nullable: true }) effectiveDate!: string | null;
  @ApiProperty({ type: String, format: 'date', nullable: true }) expiryDate!: string | null;
  @ApiProperty({ type: String, nullable: true }) sumAssured!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Snapshot currency code, or null when not provided/valid.' }) currency!: string | null;
}
export class PolicyListResponseDto {
  @ApiProperty({ type: [PolicySummaryDto] }) items!: PolicySummaryDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}
export class PolicyCustomerDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty() accountCode!: string;
}
export class PolicyBenefitDto {
  @ApiProperty({ type: String, nullable: true }) code!: string | null;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) amount!: string | null;
  @ApiProperty({ type: String, nullable: true }) unit!: string | null;
  @ApiProperty({ type: Number, nullable: true }) maxDays!: number | null;
}
export class PolicyBenefitsSnapshotDto {
  @ApiProperty({ type: String, nullable: true }) currency!: string | null;
  @ApiProperty({ type: String, format: 'date', nullable: true }) snapshotAsOf!: string | null;
  @ApiProperty({ type: Number, nullable: true }) insuranceTermYears!: number | null;
  @ApiProperty({ type: Number, nullable: true }) premiumTermYears!: number | null;
  @ApiProperty({ type: String, nullable: true }) annualPremium!: string | null;
  @ApiProperty({ type: [PolicyBenefitDto], nullable: true }) benefits!: PolicyBenefitDto[] | null;
}
export class PolicyDetailDto extends PolicySummaryDto {
  @ApiProperty({ type: PolicyCustomerDto }) customer!: PolicyCustomerDto;
  @ApiProperty({ type: PolicyBenefitsSnapshotDto, nullable: true }) benefitsSnapshot!: PolicyBenefitsSnapshotDto | null;
  @ApiProperty({ enum: ['AVAILABLE', 'NOT_PROVIDED', 'INVALID'] }) benefitsSnapshotStatus!: 'AVAILABLE' | 'NOT_PROVIDED' | 'INVALID';
}
export class PolicyDetailResponseDto {
  @ApiProperty({ type: PolicyDetailDto }) policy!: PolicyDetailDto;
}
export class PolicyDocumentDto {
  @ApiProperty({ format: 'uuid' }) documentId!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: documentKinds }) kind!: DocumentKind;
  @ApiProperty({ enum: ['PUBLIC', 'PRIVATE_POLICY'] }) accessScope!: 'PUBLIC' | 'PRIVATE_POLICY';
  @ApiProperty({ format: 'uuid' }) versionId!: string;
  @ApiProperty() versionNumber!: string;
  @ApiProperty({ format: 'date-time' }) versionCreatedAt!: string;
}
export class PolicyDocumentIssueDto {
  @ApiProperty({ type: String, nullable: true, enum: documentKinds }) kind!: DocumentKind | null;
  @ApiProperty({ enum: ['BINDINGS_NOT_PROVIDED', 'INVALID_BINDING', 'DOCUMENT_UNAVAILABLE', 'DUPLICATE_BINDING'] }) reason!: 'BINDINGS_NOT_PROVIDED' | 'INVALID_BINDING' | 'DOCUMENT_UNAVAILABLE' | 'DUPLICATE_BINDING';
}
export class PolicyDocumentsResponseDto {
  @ApiProperty({ format: 'uuid' }) policyId!: string;
  @ApiProperty({ type: [PolicyDocumentDto] }) items!: PolicyDocumentDto[];
  @ApiProperty() total!: number;
  @ApiProperty({ enum: ['AVAILABLE', 'PARTIAL', 'EMPTY', 'UNAVAILABLE'], description: 'Metadata availability only; storage access is a separate API.' }) availability!: 'AVAILABLE' | 'PARTIAL' | 'EMPTY' | 'UNAVAILABLE';
  @ApiProperty({ enum: ['AVAILABLE', 'NOT_PROVIDED', 'UNAVAILABLE'] }) mainDocumentStatus!: 'AVAILABLE' | 'NOT_PROVIDED' | 'UNAVAILABLE';
  @ApiProperty({ type: [PolicyDocumentIssueDto] }) issues!: PolicyDocumentIssueDto[];
}

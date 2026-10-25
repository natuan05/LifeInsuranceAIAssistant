import { IsString, Length } from 'class-validator';

export class OperatorLoginDto {
  @IsString() @Length(1, 100) username!: string;
  @IsString() @Length(1, 128) password!: string;
}

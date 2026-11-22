import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  TestListQuery,
  type ExamDetail,
  type ExaminerDetail,
  type ExamList,
  type SeriesDetail,
  type TestDetail,
  type TestList,
} from '@exam-prep/contracts';
import { parseContract } from '../../../common/pipes/parse-contract.js';
import { CatalogueService } from '../application/catalogue.service.js';

/** UUID or slug. */
const Key = z.string().trim().min(1).max(120).regex(/^[a-z0-9-]+$/i);
const ExaminerId = z.uuid();

// Public and identical for every visitor: browsers and CDNs may cache briefly.
const PUBLIC_CACHE = 'public, max-age=60, stale-while-revalidate=300';

/** Public catalogue (no sign-in). Published metadata only; see contracts/catalogue. */
@Controller()
export class CatalogueController {
  constructor(private readonly catalogue: CatalogueService) {}

  @Get('exams')
  @Header('Cache-Control', PUBLIC_CACHE)
  listExams(): Promise<ExamList> {
    return this.catalogue.listExams();
  }

  @Get('exams/:id')
  @Header('Cache-Control', PUBLIC_CACHE)
  getExam(@Param('id') id: string): Promise<ExamDetail> {
    return this.catalogue.getExam(parseContract(Key, id));
  }

  @Get('tests')
  @Header('Cache-Control', PUBLIC_CACHE)
  listTests(@Query() query: unknown): Promise<TestList> {
    return this.catalogue.listTests(parseContract(TestListQuery, query));
  }

  @Get('tests/:id')
  @Header('Cache-Control', PUBLIC_CACHE)
  getTest(@Param('id') id: string): Promise<TestDetail> {
    return this.catalogue.getTest(parseContract(Key, id));
  }

  @Get('series/:id')
  @Header('Cache-Control', PUBLIC_CACHE)
  getSeries(@Param('id') id: string): Promise<SeriesDetail> {
    return this.catalogue.getSeries(parseContract(Key, id));
  }

  @Get('examiners/:id')
  @Header('Cache-Control', PUBLIC_CACHE)
  getExaminer(@Param('id') id: string): Promise<ExaminerDetail> {
    return this.catalogue.getExaminer(parseContract(ExaminerId, id));
  }
}

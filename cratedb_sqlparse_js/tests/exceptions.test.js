import {expect, test} from 'vitest'
import {sqlparse} from "../cratedb_sqlparse/index.js";
import {ParseError} from "../cratedb_sqlparse/parser.js";

test('ParsingError is raised when raise_exception=true', () => {
    expect(() => sqlparse('some non sql string', true)).toThrowError(ParseError)
})

test('Errors are NOT raised on a correct statement', () => {
    expect(() => sqlparse('SELECT COUNT(*) FROM doc.tbl f WHERE f.id = 1', true)).not.toThrowError()
})

test('Error should be collected and not thrown by default', () => {
    const stmts = sqlparse('SLCT 2;')
    expect(() => stmts).not.toThrowError()
})

test('Single error should be collected', () => {
    const stmt = sqlparse("SELECT A,B,C,D FROM tbl1 WHERE A ? '%A'")
    expect(stmt[0].exception).toBeDefined()
    expect(stmt[0].exception.msg).toBe("mismatched input '?' expecting {<EOF>, ';'}")
    expect(stmt[0].exception.query).toBe("SELECT A,B,C,D FROM tbl1 WHERE A ?")
})

test('Several errors should be collected and not thrown by default', () => {
    const stmts = sqlparse(`
        SELECT A FROM tbl1 where;
        SELECT 1;
        SELECT D, A FROM tbl1 WHERE;
    `)
    expect(stmts).length(3)
    expect(stmts[0].exception).not.toBeNull();
    expect(stmts[1].exception).toBeNull();
    expect(stmts[2].exception).not.toBeNull();
})

test('Several Errors should be collected and not thrown by default 2, special case*', () => {
    // This query is an special case, see parser
    const stmts = sqlparse(`       
        SELEC 1;
        SELECT A, B, C, D FROM tbl1;
        SELECT D, A FROM tbl1 WHERE;
        `)

    expect(stmts).length(3)
    expect(stmts[0].exception).not.toBeNull();
    expect(stmts[1].exception).toBeNull();
    expect(stmts[2].exception).not.toBeNull();
})

test('Several Errors should be collected and not thrown by default 3', () => {
    // language=SQL format=false
const stmts = sqlparse(`
        SELECT 1;
        SELECT A, B, C, D FROM tbl1;
        INSERT INTO doc.tbl VALUES (1, 2, 'three', ['four']);
    `)

    expect(stmts).length(3)
    expect(stmts[0].exception).toBeNull();
    expect(stmts[1].exception).toBeNull();
    expect(stmts[2].exception).toBeNull();
})

test('Exception message is correct', () => {
    const stmts = sqlparse(`         
        SELEC 1;
        SELECT A, B, C, D FROM tbl1;
        SELECT D, A FROM tbl1 WHERE;`
    )
    const expectedMessage = "[line 2:8 mismatched input 'SELEC' expecting {'SELECT', 'DEALLOCATE', 'FETCH', 'END', 'WITH', 'CREATE', 'ALTER', 'KILL', 'CLOSE', 'BEGIN', 'START', 'COMMIT', 'ANALYZE', 'DISCARD', 'EXPLAIN', 'SHOW', 'OPTIMIZE', 'REFRESH', 'RESTORE', 'DROP', 'INSERT', 'VALUES', 'DELETE', 'UPDATE', 'SET', 'RESET', 'COPY', 'GRANT', 'DENY', 'REVOKE', 'DECLARE'}]"
    const expectedMessageVerbose = "         \n" +
        "        SELEC 1;\n" +
        "        ^^^^^\n" +
        "        SELECT A, B, C, D FROM tbl1;\n" +
        "        SELECT D, A FROM tbl1 WHERE;"

    expect(stmts[0].exception.errorMessage).toBe(expectedMessage)
    expect(stmts[0].exception.getOriginalQueryWithErrorMarked()).toBe(expectedMessageVerbose)
})


test('White or special characters should not avoid exception catching', () => {
    // https://github.com/crate/cratedb-sqlparse/issues/67
    const stmts = [
        `SELECT 1\n limit `,
        `SELECT 1\r limit `,
        `SELECT 1\t limit `,
        `SELECT 1 limit `
    ]
    for (const stmt in stmts) {
        let r = sqlparse(stmt)
        expect(r[0].exception).toBeDefined();
    }
})

test('Missing token error should not panic', ()=> {
    // See https://github.com/crate/cratedb-sqlparse/issues/66
    sqlparse(`
    CREATE TABLE t01 (
       "x" OBJECT (DYNAMIC),
       "y" OBJECT (DYNAMIC) AS ("z" ARRAY(OBJECT (DYNAMIC))      
       );
`)
})

test('Special characters should not avoid exception catching', () => {
    // https://github.com/crate/cratedb-sqlparse/issues/67
    const stmts = [
        `SELECT 1\n limit `,
        `SELECT 1\r limit `,
        `SELECT 1\t limit `,
        `SELECT 1 limit `
    ]
    for (const stmt in stmts) {
        let r = sqlparse(stmt)
        expect(r[0].exception).not.toBeNull();
    }
})

test('Special query with several errors should correctly be matched regardless of spaces', () => {
    // See https://github.com/crate/cratedb-sqlparse/issues/107
    const stmts = [
        `
        SELECT A FROM tbl1 where ;
        SELECT 1;
        SELECT D, A FROM tbl1 WHERE;
        `,

        `
        SELECT
          A
        FROM
          tbl1
        WHERE;

        SELECT 
          1;

        SELECT
          B
        FROM
          tbl1
        WHERE;
        `
    ]
    for (const stmt of stmts) {
        const r = sqlparse(stmt)
        expect(r[0].exception).not.toBeNull()
        expect(r[1].exception).toBeNull()
        expect(r[2].exception).not.toBeNull()
    }
})

test('Missing EOF should not block error catching', () => {
    const stmts = [
        `
        select 1;
        select 2
        select 3;
        `,
        `
        select 1;
        select 1 I can put anything here
        select 3
        `
    ]

    for (const stmt of stmts) {
        const r = sqlparse(stmt)
        expect(r[0].exception).toBeNull()
        expect(r[1].exception).not.toBeNull()
    }
})
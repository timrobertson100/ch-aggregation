package org.gbif.ch;

import com.clickhouse.client.api.Client;
import com.clickhouse.client.api.data_formats.ClickHouseBinaryFormatReader;
import com.clickhouse.client.api.query.QueryResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.concurrent.TimeUnit;

@RestController
public class DataController {

  @GetMapping("/h3")
  public String index() {

    Client client = new Client.Builder()
        .addEndpoint("http://scrap-vh.gbif-dev.org:8123/")
        .setUsername("default")
        .setPassword("clickhouse")
        .build();

    //final String sql = "select h3ToString(id) as id from h3 limit 10000";
    //final String sql = "select h3ToString(id) as id, occcount from h3";
    final String sql = "select h3ToString(h3_3) as id, sum(occcount) " +
        "from h3 " +
        "where orderkey=797 and year>2020 " +
        "group by id";


    try (QueryResponse response = client.query(sql).get(10, TimeUnit.SECONDS);) {
      ClickHouseBinaryFormatReader reader = client.newBinaryFormatReader(response);

      StringBuffer sb = new StringBuffer();

      while (reader.hasNext()) {
        reader.next(); // Read the next record from stream and parse it

        sb.append(reader.getString("id")  );
        sb.append('|');
        sb.append(reader.getLong("occcount")  );
        if (reader.hasNext()) sb.append(",");

      }
      return sb.toString();
    } catch (Exception e) {
      e.printStackTrace();
      return e.getMessage();
    }
  }

}
